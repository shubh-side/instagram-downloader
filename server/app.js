const express = require('express');
const axios = require('axios');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));
app.use(cors());
app.use('/downloads', express.static(path.join(__dirname, '..', 'uploads')));

// List of free proxies - these should be updated regularly as they can become unavailable
// You can get updated proxies from sites like https://free-proxy-list.net/
const proxies = [
    'http://9.223.187.19:3128',
    'http://137.184.174.32:4857',
    'http://185.21.13.91:40969',
    'http://139.59.1.14:80',
    'http://161.35.70.249:8080',
    // Add more proxies as needed
];

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
];

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

const userAgent = getRandomUserAgent();
// Add to your headers
// Function to get a random proxy from the list
function getRandomProxy() {
    return proxies[Math.floor(Math.random() * proxies.length)];
}


async function downloadWithPuppeteer(url, uniqueId, uploadsDir) {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });
        
        // Wait for media to load
        await page.waitForSelector('video, img.FFVAD', { timeout: 5000 });
        
        // Check for video
        const hasVideo = await page.evaluate(() => {
            return document.querySelector('video') !== null;
        });
        
        let mediaUrl, mediaType;
        
        if (hasVideo) {
            mediaUrl = await page.evaluate(() => {
                const video = document.querySelector('video');
                return video ? video.src : null;
            });
            mediaType = 'video';
        } else {
            mediaUrl = await page.evaluate(() => {
                const img = document.querySelector('img.FFVAD');
                return img ? img.src : null;
            });
            mediaType = 'image';
        }
        
        if (!mediaUrl) {
            throw new Error('No media found on page');
        }
        
        // Download the media
        const extension = mediaType === 'video' ? '.mp4' : '.jpg';
        const outputPath = path.join(uploadsDir, `${uniqueId}${extension}`);
        
        const mediaResponse = await axios({
            method: 'GET',
            url: mediaUrl,
            responseType: 'stream'
        });
        
        const writer = fs.createWriteStream(outputPath);
        mediaResponse.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                resolve({
                    success: true,
                    mediaUrl: `/downloads/${uniqueId}${extension}`,
                    mediaType: mediaType,
                    filename: `instagram-content-${Date.now()}${extension}`
                });
            });
            writer.on('error', reject);
        });
    } finally {
        await browser.close();
    }
}

// Function to handle response with carousel
function handleCarouselResponse(data) {
    const downloadContainer = document.getElementById('download-container');
    
    // Clear previous content
    downloadContainer.innerHTML = '';
    
    // Add the first item preview
    const mainItem = document.createElement('div');
    mainItem.className = 'main-item';
    mainItem.innerHTML = `
        <h3>Downloaded Item 1 of ${data.carouselCount}</h3>
        <div class="media-container">
            ${data.mediaType === 'video' 
                ? `<video controls src="${data.mediaUrl}" class="media-preview"></video>` 
                : `<img src="${data.mediaUrl}" class="media-preview" />`}
        </div>
        <a href="${data.mediaUrl}" download="${data.filename}" class="download-btn">Download</a>
    `;
    downloadContainer.appendChild(mainItem);
    
    // Add carousel items section if it exists
    if (data.isCarousel && data.carouselItems && data.carouselItems.length > 1) {
        const carouselSection = document.createElement('div');
        carouselSection.className = 'carousel-section';
        
        // Add header
        const header = document.createElement('h3');
        header.textContent = 'All Items in This Post';
        carouselSection.appendChild(header);
        
        // Create grid for carousel items
        const grid = document.createElement('div');
        grid.className = 'carousel-grid';
        
        // Add each item
        data.carouselItems.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'carousel-item';
            itemElement.innerHTML = `
                <div class="thumbnail-container">
                    <img src="${item.thumbnailUrl}" class="thumbnail" />
                    <span class="item-type">${item.type}</span>
                </div>
                <button class="download-item-btn" data-index="${item.index}" data-id="${item.uniqueId}">
                    Download Item ${item.index}
                </button>
            `;
            grid.appendChild(itemElement);
        });
        
        carouselSection.appendChild(grid);
        downloadContainer.appendChild(carouselSection);
        
        // Add event listeners to download buttons
        document.querySelectorAll('.download-item-btn').forEach(button => {
            button.addEventListener('click', function() {
                const index = this.getAttribute('data-index');
                const uniqueId = this.getAttribute('data-id');
                downloadCarouselItem(currentUrl, index, uniqueId);
            });
        });
    }
}

// Function to download a specific carousel item
async function downloadCarouselItem(url, itemIndex, uniqueId) {
    try {
        // Show loading state
        const button = document.querySelector(`[data-index="${itemIndex}"]`);
        const originalText = button.textContent;
        button.textContent = 'Downloading...';
        button.disabled = true;
        
        // Make the request
        const response = await fetch('/api/download-item', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                itemIndex: parseInt(itemIndex),
                uniqueId: uniqueId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Create download link
            const link = document.createElement('a');
            link.href = data.mediaUrl;
            link.download = data.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Update button state
            button.textContent = 'Downloaded!';
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);
        } else {
            button.textContent = 'Failed';
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);
            showError(data.message || 'Download failed');
        }
    } catch (error) {
        console.error('Error downloading item:', error);
        showError('Failed to download item');
    }
}

// Function to download content using FastSaverAPI
// Function to download content using FastSaverAPI
async function downloadWithFastSaverAPI(url, uniqueId, outputDir) {
    try {
        // Get API key
        const API_KEY = process.env.FASTSAVER_API_KEY || '';
        
        if (!API_KEY) {
            console.warn('FastSaverAPI key not configured. Set the FASTSAVER_API_KEY environment variable.');
            return null;
        }
        
        const apiUrl = 'https://fastsaverapi.com/get-info';
        
        console.log(`Attempting FastSaverAPI call to ${apiUrl} with token ${API_KEY.substring(0, 4)}...`);
        
        // Make the API request with the correct format
        const response = await axios({
            method: 'GET',
            url: apiUrl,
            params: {
                url: url,
                token: API_KEY
            },
            timeout: 15000
        });
        
        console.log('FastSaverAPI response status:', response.status);
        console.log('FastSaverAPI response data preview:', JSON.stringify(response.data).substring(0, 100));
        
        if (!response.data) {
            throw new Error('Empty response from FastSaverAPI');
        }
        
        // Check if there was an error
        if (response.data.error !== false) {
            throw new Error(`FastSaverAPI returned error: ${JSON.stringify(response.data)}`);
        }
        
        console.log('Response type:', response.data.type);
        
        // Check if this is a story
        const isStory = url.includes('/stories/');
        
        // If it's an album/carousel, handle appropriately
        if ((response.data.type === 'album' || isStory) && 
            response.data.medias && 
            response.data.medias.length > 0) {
            
            console.log('Detected album with multiple media items');
            
            // For a single download request, just return the first item but indicate it's a carousel
            const firstItem = response.data.medias[0];
            
            // Use the download_url from the first item
            let mediaType = firstItem.type === 'video' ? 'video' : 'image';
            let mediaUrl = firstItem.download_url;
            
            if (!mediaUrl) {
                throw new Error('No download_url found in first album item');
            }
            
            console.log(`Downloading first ${mediaType} from ${mediaUrl}`);
            
            const extension = mediaType === 'video' ? '.mp4' : '.jpg';
            const outputPath = path.join(outputDir, `${uniqueId}${extension}`);
            
            // Download the media
            const mediaResponse = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'stream',
                timeout: 30000
            });
            
            const writer = fs.createWriteStream(outputPath);
            mediaResponse.data.pipe(writer);
            
            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`Successfully downloaded media to ${outputPath}`);
                    
                    // Prepare carousel items - use the thumbnails directly from the API response
                    const carouselItems = response.data.medias.map((item, index) => {
                        let itemType = item.type === 'video' ? 'video' : 'image';
                        
                        // For the first item, we can use our downloaded file as thumbnail
                        // For others, use the thumbnail URL from the API
                        let thumbnailUrl = '';
                        if (index === 0) {
                            thumbnailUrl = `/downloads/${uniqueId}${extension}`;
                        } else if (item.thumb) {
                            thumbnailUrl = `/proxy-thumbnail?url=${encodeURIComponent(item.thumb)}`;
                        } else if (item.download_url) {
                            // For multi-image posts where individual items don't have thumbnails
                            thumbnailUrl = `/proxy-thumbnail?url=${encodeURIComponent(item.download_url)}`;
                        } else if (response.data.thumb) {
                            // Use the post's main thumbnail as fallback
                            thumbnailUrl = `/proxy-thumbnail?url=${encodeURIComponent(response.data.thumb)}`;
                        } else {
                            // Last resort fallback
                            thumbnailUrl = item.download_url;
                        }
                        return {
                            index: index + 1,
                            type: itemType,
                            thumbnailUrl: thumbnailUrl,
                            uniqueId: `${uniqueId}-${index + 1}`
                        };
                    });
                    
                    // Return with the carousel items including proper thumbnails
                    resolve({
                        success: true,
                        mediaUrl: `/downloads/${uniqueId}${extension}`,
                        mediaType: mediaType,
                        filename: `instagram-content-${Date.now()}${extension}`,
                        isCarousel: true,
                        isStory: isStory,
                        carouselCount: response.data.medias.length,
                        carouselItems: carouselItems
                    });
                });
                writer.on('error', reject);
            });
        } else {
            // Regular single media handling
            let mediaType = response.data.type === 'video' ? 'video' : 'image';
            let mediaUrl = response.data.download_url;
            
            if (!mediaUrl) {
                throw new Error('No download_url found in FastSaverAPI response');
            }
            
            console.log(`Downloading ${mediaType} from ${mediaUrl}`);
            
            const extension = mediaType === 'video' ? '.mp4' : '.jpg';
            const outputPath = path.join(outputDir, `${uniqueId}${extension}`);
            
            // Download the media
            const mediaResponse = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'stream',
                timeout: 30000
            });
            
            const writer = fs.createWriteStream(outputPath);
            mediaResponse.data.pipe(writer);
            
            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`Successfully downloaded media to ${outputPath}`);
                    resolve({
                        success: true,
                        mediaUrl: `/downloads/${uniqueId}${extension}`,
                        mediaType: mediaType,
                        filename: `instagram-content-${Date.now()}${extension}`
                    });
                });
                writer.on('error', reject);
            });
        }
    } catch (error) {
        console.error('FastSaverAPI detailed error:', error.message);
        if (error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
        }
        return null;
    }
}

// Function to handle carousel downloads with FastSaverAPI
async function downloadCarouselWithFastSaverAPI(url, carouselId, carouselDir) {
    try {
        const API_KEY = process.env.FASTSAVER_API_KEY || '';
        
        if (!API_KEY) {
            console.warn('FastSaverAPI key not configured. Set the FASTSAVER_API_KEY environment variable.');
            return null;
        }
        
        const apiUrl = 'https://fastsaverapi.com/get-info';
        
        console.log(`Attempting carousel download with FastSaverAPI...`);
        
        // Make the API request
        const response = await axios({
            method: 'GET',
            url: apiUrl,
            params: {
                url: url,
                token: API_KEY
            },
            timeout: 15000
        });
        
        console.log('FastSaverAPI carousel response:', JSON.stringify(response.data).substring(0, 100));
        
        if (!response.data) {
            throw new Error('Empty response from FastSaverAPI');
        }
        
        // Check if there was an error
        if (response.data.error !== false) {
            throw new Error(`FastSaverAPI returned error: ${JSON.stringify(response.data)}`);
        }
        
        // Check if this is a carousel post with multiple items
        if (response.data.type !== 'album' || !response.data.medias || !Array.isArray(response.data.medias) || response.data.medias.length === 0) {
            console.log('This is not a carousel post or no media items found');
            console.log('Available fields:', Object.keys(response.data));
            
            // If it's not an album but has download_url, create a single-item array
            if (response.data.download_url) {
                console.log('Found single media item, creating array');
                response.data.medias = [{
                    type: response.data.type,
                    download_url: response.data.download_url
                }];
            } else {
                throw new Error('Not a carousel or no items found');
            }
        }
        
        // Process each media item
        const mediaItems = [];
        let index = 1;
        
        for (const item of response.data.medias) {
            const mediaType = item.type === 'video' ? 'video' : 'image';
            const mediaUrl = item.download_url;
            
            if (!mediaUrl) {
                console.warn(`No URL found for carousel item ${index}, skipping`);
                continue;
            }
            
            const extension = mediaType === 'video' ? '.mp4' : '.jpg';
            const filename = `${index}${extension}`;
            const outputPath = path.join(carouselDir, filename);
            
            console.log(`Downloading carousel item ${index} (${mediaType}) from ${mediaUrl}`);
            
            // Download the media
            try {
                const mediaResponse = await axios({
                    method: 'GET',
                    url: mediaUrl,
                    responseType: 'stream',
                    timeout: 30000
                });
                
                const writer = fs.createWriteStream(outputPath);
                mediaResponse.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                
                mediaItems.push({
                    url: `/downloads/${carouselId}/${filename}`,
                    type: mediaType,
                    filename: `instagram-content-${Date.now()}-${filename}`
                });
                
                index++;
            } catch (err) {
                console.error(`Error downloading carousel item ${index}:`, err.message);
                // Continue to next item even if one fails
            }
        }
        
        return mediaItems.length > 0 ? mediaItems : null;
    } catch (error) {
        console.error('FastSaverAPI carousel error:', error.message);
        if (error.response) {
            console.error('Error response data:', error.response.data);
        }
        return null;
    }
}

// API endpoint to download a specific carousel/story item
app.post('/api/download-item', async (req, res) => {
    try {
        const { url, itemIndex, uniqueId } = req.body;
        
        if (!url || itemIndex === undefined || !uniqueId) {
            return res.status(400).json({ 
                success: false, 
                message: 'URL, itemIndex, and uniqueId are required' 
            });
        }
        
        // Validate Instagram URL
        if (!isValidInstagramUrl(url)) {
            return res.status(400).json({ success: false, message: 'Invalid Instagram URL' });
        }
        
        // Fetch all items information first
        const API_KEY = process.env.FASTSAVER_API_KEY || '';
        
        if (!API_KEY) {
            return res.status(500).json({ 
                success: false, 
                message: 'FastSaverAPI key not configured' 
            });
        }
        
        console.log(`Attempting to download carousel/story item ${itemIndex} from ${url}`);
        
        // Fetch media data from FastSaverAPI
        const apiUrl = 'https://fastsaverapi.com/get-info';
        const response = await axios({
            method: 'GET',
            url: apiUrl,
            params: {
                url: url,
                token: API_KEY
            },
            timeout: 15000
        });
        
        if (!response.data || response.data.error !== false) {
            throw new Error('Failed to fetch data from FastSaverAPI');
        }
        
        // Check if we have medias array and the requested index exists
        if (!response.data.medias || 
            !Array.isArray(response.data.medias) || 
            !response.data.medias[itemIndex - 1]) {
            return res.status(404).json({ 
                success: false, 
                message: 'Requested item not found' 
            });
        }
        
        // Get the specific item
        const mediaItem = response.data.medias[itemIndex - 1];
        const mediaType = mediaItem.type === 'video' ? 'video' : 'image';
        const mediaUrl = mediaItem.download_url;
        
        if (!mediaUrl) {
            return res.status(404).json({ 
                success: false, 
                message: 'Media URL not found for requested item' 
            });
        }
        
        // Set the file extension based on type
        const extension = mediaType === 'video' ? '.mp4' : '.jpg';
        const outputPath = path.join(uploadsDir, `${uniqueId}${extension}`);
        
        // Download the media
        const mediaResponse = await axios({
            method: 'GET',
            url: mediaUrl,
            responseType: 'stream',
            timeout: 30000
        });
        
        const writer = fs.createWriteStream(outputPath);
        mediaResponse.data.pipe(writer);
        
        // Wait for download to complete
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        return res.status(200).json({
            success: true,
            mediaUrl: `/downloads/${uniqueId}${extension}`,
            mediaType: mediaType,
            filename: `instagram-content-${Date.now()}-item${itemIndex}${extension}`
        });
        
    } catch (error) {
        console.error('Item download error:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: 'Could not download the requested item' 
        });
    }
});

// Add this to your app.js
app.get('/proxy-thumbnail', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).send('No URL provided');
        }
        
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });
        
        // Set appropriate headers
        res.setHeader('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (error) {
        console.error('Thumbnail proxy error:', error);
        res.status(500).send('Error proxying thumbnail');
    }
});

// API endpoint to handle Instagram content download
// API endpoint to handle Instagram content download
app.post('/api/download', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ success: false, message: 'URL is required' });
        }
        
        // Validate Instagram URL
        if (!isValidInstagramUrl(url)) {
            return res.status(400).json({ success: false, message: 'Invalid Instagram URL' });
        }
        
        // Generate unique ID for the file
        const uniqueId = uuidv4();
        
        // Determine content type from URL
        const contentType = getContentTypeFromUrl(url);
        
        // Extract shortcode from URL for instaloader
        const shortcode = extractShortcode(url);
        
        // Set output paths
        const outputTemplate = path.join(uploadsDir, `${uniqueId}.%(ext)s`);
        const instaloadDir = path.join(uploadsDir, `insta_${uniqueId}`);
        
        // Track which method succeeded
        let successMethod = null;
        let mediaInfo = null;
        
        // Try FastSaverAPI first for all content types if configured
        if (process.env.FASTSAVER_API_KEY) {
            try {
                console.log(`Attempting to download ${contentType} with FastSaverAPI...`);
                mediaInfo = await downloadWithFastSaverAPI(url, uniqueId, uploadsDir);
                
                if (mediaInfo) {
                    successMethod = 'FastSaverAPI';
                    console.log(`Successfully downloaded using method: ${successMethod}`);
                    return res.status(200).json(mediaInfo);
                } else {
                    console.log("FastSaverAPI method returned no results, trying alternative methods...");
                }
            } catch (error) {
                console.error('FastSaverAPI error:', error.message);
                console.log("Falling back to alternative download methods...");
            }
        } else {
            console.log("FastSaverAPI key not configured, using alternative download methods...");
        }
        
        // If FastSaverAPI failed or not configured, try yt-dlp with proxy
        try {
            console.log("Attempting download with yt-dlp and proxy...");
            const proxy = getRandomProxy();
            
            let ytdlpCommand = `yt-dlp "${url}" -o "${outputTemplate}" --proxy "${proxy}"`;
            
            // Add specific parameters for content types
            if (contentType === 'story') {
                ytdlpCommand += ' --extractor-args "instagram:include_stories=1"';
            }
            
            if (contentType === 'post') {
                // For image posts, we want to ensure we get the image
                ytdlpCommand += ' --write-thumbnail --convert-thumbnails jpg';
            }
            
            console.log(`Executing: ${ytdlpCommand}`);
            execSync(ytdlpCommand, { stdio: 'inherit' });
            
            // Find the downloaded file
            const files = fs.readdirSync(uploadsDir);
            const downloadedFile = files.find(file => file.startsWith(uniqueId));
            
            if (downloadedFile) {
                const actualExtension = path.extname(downloadedFile).toLowerCase();
                let mediaType = ['.mp4', '.mov', '.webm'].includes(actualExtension) ? 'video' : 'image';
                
                mediaInfo = {
                    success: true,
                    mediaUrl: `/downloads/${downloadedFile}`,
                    mediaType: mediaType,
                    filename: `instagram-content-${Date.now()}${actualExtension}`
                };
                
                successMethod = 'yt-dlp with proxy';
                console.log(`Successfully downloaded using method: ${successMethod}`);
                return res.status(200).json(mediaInfo);
            } else {
                throw new Error("No file was downloaded by yt-dlp");
            }
        } catch (ytdlpError) {
            console.error('yt-dlp with proxy error:', ytdlpError.message);
            
            // Try instaloader if yt-dlp failed
            if (shortcode) {
                try {
                    console.log("Attempting download with instaloader...");
                    
                    // Create directory for instaloader output
                    if (!fs.existsSync(instaloadDir)) {
                        fs.mkdirSync(instaloadDir, { recursive: true });
                    }
                    
                    // Different commands for different content types
                    let instaloaderCommand;
                    
                    if (contentType === 'story') {
                        // For stories, we need the username
                        const username = extractUsernameFromStoryUrl(url);
                        if (username) {
                            instaloaderCommand = `instaloader --no-metadata-json --no-captions --no-video-thumbnails --dirname-pattern="${instaloadDir}" --filename-pattern="${uniqueId}" --stories "${username}"`;
                        } else {
                            throw new Error("Could not extract username from story URL");
                        }
                    } else {
                        // For posts and reels
                        instaloaderCommand = `instaloader --no-metadata-json --no-captions --no-video-thumbnails --dirname-pattern="${instaloadDir}" --filename-pattern="${uniqueId}" -- "-${shortcode}"`;
                    }
                    
                    console.log(`Executing: ${instaloaderCommand}`);
                    execSync(instaloaderCommand, { stdio: 'inherit' });
                    
                    // Find the downloaded file(s)
                    const instaloadFiles = fs.existsSync(instaloadDir) ? fs.readdirSync(instaloadDir) : [];
                    const downloadedFile = instaloadFiles.find(file => file.includes(uniqueId));
                    
                    if (downloadedFile) {
                        // Move the file to the main uploads directory
                        const sourcePath = path.join(instaloadDir, downloadedFile);
                        const actualExtension = path.extname(downloadedFile).toLowerCase();
                        const newFilename = `${uniqueId}${actualExtension}`;
                        const destPath = path.join(uploadsDir, newFilename);
                        
                        fs.copyFileSync(sourcePath, destPath);
                        
                        // Clean up the instaloader directory
                        fs.rmSync(instaloadDir, { recursive: true, force: true });
                        
                        let mediaType = ['.mp4', '.mov', '.webm'].includes(actualExtension) ? 'video' : 'image';
                        
                        mediaInfo = {
                            success: true,
                            mediaUrl: `/downloads/${newFilename}`,
                            mediaType: mediaType,
                            filename: `instagram-content-${Date.now()}${actualExtension}`
                        };
                        
                        successMethod = 'instaloader';
                        console.log(`Successfully downloaded using method: ${successMethod}`);
                        return res.status(200).json(mediaInfo);
                    } else {
                        throw new Error("No file was downloaded by instaloader");
                    }
                } catch (instaloaderError) {
                    console.error('Instaloader error:', instaloaderError.message);
                    
                    // Clean up instaloader directory if it exists
                    if (fs.existsSync(instaloadDir)) {
                        fs.rmSync(instaloadDir, { recursive: true, force: true });
                    }
                    
                    // Last resort: Try direct extraction
                    try {
                        console.log("Attempting direct content extraction...");
                        mediaInfo = await extractContentDirectly(url, uniqueId, uploadsDir);
                        
                        if (mediaInfo) {
                            successMethod = 'direct extraction';
                            console.log(`Successfully downloaded using method: ${successMethod}`);
                            return res.status(200).json(mediaInfo);
                        } else {
                            throw new Error("Direct extraction returned no results");
                        }
                    } catch (directError) {
                        console.error('Direct extraction error:', directError.message);
                        throw new Error("All download methods failed");
                    }
                }
            } else {
                // If we couldn't extract shortcode, try direct extraction
                try {
                    console.log("Could not extract shortcode, trying direct content extraction...");
                    mediaInfo = await extractContentDirectly(url, uniqueId, uploadsDir);
                    
                    if (mediaInfo) {
                        successMethod = 'direct extraction';
                        console.log(`Successfully downloaded using method: ${successMethod}`);
                        return res.status(200).json(mediaInfo);
                    } else {
                        throw new Error("Direct extraction returned no results");
                    }
                } catch (directError) {
                    console.error('Direct extraction error:', directError.message);
                    throw new Error("All download methods failed");
                }
            }
        }
    } catch (error) {
        console.error('Main error:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: 'Could not extract media from the provided URL' 
        });
    }
});

// Function to extract content directly from Instagram page
async function extractContentDirectly(url, uniqueId, uploadsDir) {
    try {
        // Fetch the Instagram page
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Check for video content first
        let mediaUrl = $('meta[property="og:video"]').attr('content');
        let mediaType = 'video';
        
        // If no video, check for image
        if (!mediaUrl) {
            mediaUrl = $('meta[property="og:image"]').attr('content');
            mediaType = 'image';
        }
        
        // If still no media found, look in script tags
        if (!mediaUrl) {
            const scripts = $('script[type="text/javascript"]').toArray();
            
            for (const script of scripts) {
                const content = $(script).html();
                if (!content) continue;
                
                // Look for video_url pattern
                const videoMatch = content.match(/"video_url":"([^"]+)"/);
                if (videoMatch && videoMatch[1]) {
                    mediaUrl = videoMatch[1].replace(/\\/g, '');
                    mediaType = 'video';
                    break;
                }
                
                // Look for display_url pattern for images
                const imageMatch = content.match(/"display_url":"([^"]+)"/);
                if (imageMatch && imageMatch[1]) {
                    mediaUrl = imageMatch[1].replace(/\\/g, '');
                    mediaType = 'image';
                    break;
                }
            }
        }
        
        if (!mediaUrl) {
            return null;
        }
        
        // Set file extension based on media type
        const extension = mediaType === 'video' ? '.mp4' : '.jpg';
        const outputPath = path.join(uploadsDir, `${uniqueId}${extension}`);
        
        // Download the media
        const mediaResponse = await axios({
            method: 'GET',
            url: mediaUrl,
            responseType: 'stream'
        });
        
        const writer = fs.createWriteStream(outputPath);
        mediaResponse.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                resolve({
                    success: true,
                    mediaUrl: `/downloads/${uniqueId}${extension}`,
                    mediaType: mediaType,
                    filename: `instagram-content-${Date.now()}${extension}`
                });
            });
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('Direct extraction error details:', error.message);
        return null;
    }
}

// Function to extract username from story URL
function extractUsernameFromStoryUrl(url) {
    // Standard story URL format
    let match = url.match(/instagram\.com\/stories\/([^\/]+)/);
    if (match && match[1]) {
        return match[1];
    }
    
    // Short URL format - needs to be resolved first
    if (url.includes('instagram.com/s/')) {
        // For short URLs, we need to make a request to get the redirect URL
        try {
            const response = axios.get(url, {
                maxRedirects: 0,
                validateStatus: status => status >= 200 && status < 400
            });
            
            // If we get a redirect, extract the username from the Location header
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
                match = redirectUrl.match(/instagram\.com\/stories\/([^\/]+)/);
                if (match && match[1]) {
                    return match[1];
                }
            }
        } catch (error) {
            // If we can't resolve the short URL, return null
            console.error('Error resolving short URL:', error.message);
        }
    }
    
    return null;
}

// Function to extract shortcode from Instagram URL
function extractShortcode(url) {
    // For posts, reels, and TV
    let match = url.match(/\/(p|reel|tv)\/([^\/\?]+)/);
    if (match && match[2]) {
        return match[2];
    }
    
    // For stories
    match = url.match(/\/stories\/[^\/]+\/([^\/\?]+)/);
    if (match && match[1]) {
        return match[1];
    }
    
    // For highlights
    match = url.match(/\/stories\/highlights\/([^\/\?]+)/);
    if (match && match[1]) {
        return match[1];
    }
    
    return null;
}

// Function to validate Instagram URL
function isValidInstagramUrl(url) {
    // Basic Instagram URL validation
    const basicRegex = /^https?:\/\/(www\.)?instagram\.com\//;
    if (!basicRegex.test(url)) {
        return false;
    }
    
    // Check for different content types
    const reelRegex = /instagram\.com\/reel\/([^\/\?]+)/;
    const postRegex = /instagram\.com\/p\/([^\/\?]+)/;
    const tvRegex = /instagram\.com\/tv\/([^\/\?]+)/;
    const highlightRegex = /instagram\.com\/stories\/highlights\/([^\/\?]+)/;
    
    // Multiple story URL formats
    const storyRegex1 = /instagram\.com\/stories\/([^\/]+)\/([^\/\?]+)/; // Standard format
    const storyRegex2 = /instagram\.com\/stories\/([^\/\?]+)/; // Username only format
    const storyRegex3 = /instagram\.com\/s\/([^\/\?]+)/; // Short URL format
    
    return (
        reelRegex.test(url) ||
        postRegex.test(url) ||
        tvRegex.test(url) ||
        highlightRegex.test(url) ||
        storyRegex1.test(url) ||
        storyRegex2.test(url) ||
        storyRegex3.test(url)
    );
}

// Function to determine content type from URL
function getContentTypeFromUrl(url) {
    if (url.includes('/reel/') || url.includes('/tv/')) {
        return 'reel';
    } else if (
        url.includes('/stories/') || 
        url.includes('/highlights/') || 
        url.includes('instagram.com/s/')
    ) {
        return 'story';
    } else if (url.includes('/p/')) {
        return 'post'; // Posts can be image or video
    } else {
        return 'unknown';
    }
}

// API endpoint to handle multiple posts/carousel download
app.post('/api/download-all', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ success: false, message: 'URL is required' });
        }
        
        // For posts with multiple images/videos (carousel)
        if (url.includes('/p/')) {
            // Generate a unique folder name for this carousel
            const carouselId = uuidv4();
            const carouselDir = path.join(uploadsDir, carouselId);
            
            // Create directory for the carousel
            if (!fs.existsSync(carouselDir)) {
                fs.mkdirSync(carouselDir, { recursive: true });
            }
            
            // Extract shortcode for instaloader
            const shortcode = extractShortcode(url);
            
            // Track which method succeeded
            let successMethod = null;
            let mediaItems = [];
            
            // Try FastSaverAPI first if configured
            if (process.env.FASTSAVER_API_KEY) {
                try {
                    console.log("Attempting carousel download with FastSaverAPI...");
                    mediaItems = await downloadCarouselWithFastSaverAPI(url, carouselId, carouselDir);
                    
                    if (mediaItems && mediaItems.length > 0) {
                        successMethod = 'FastSaverAPI';
                    } else {
                        throw new Error("FastSaverAPI method failed or no items found");
                    }
                } catch (fastSaverError) {
                    console.error('FastSaverAPI carousel error:', fastSaverError.message);
                    // Continue to next method
                }
            }
            
            // If FastSaverAPI failed or not configured, try yt-dlp
            if (!mediaItems || mediaItems.length === 0) {
                try {
                    console.log("Attempting carousel download with yt-dlp and proxy...");
                    const proxy = getRandomProxy();
                    
                    let ytdlpCommand = `yt-dlp "${url}" -o "${carouselDir}/%(playlist_index)s.%(ext)s" --proxy "${proxy}" --write-thumbnail --convert-thumbnails jpg`;
                    
                    console.log(`Executing: ${ytdlpCommand}`);
                    execSync(ytdlpCommand, { stdio: 'inherit' });
                    
                    // Find the downloaded files
                    const files = fs.readdirSync(carouselDir);
                    
                    if (files.length === 0) {
                        throw new Error("No files were downloaded");
                    }
                    
                    // Process the downloaded files
                    mediaItems = files.map(file => {
                        const extension = path.extname(file).toLowerCase();
                        const mediaType = ['.mp4', '.mov', '.webm'].includes(extension) ? 'video' : 'image';
                        
                        return {
                            url: `/downloads/${carouselId}/${file}`,
                            type: mediaType,
                            filename: `instagram-content-${Date.now()}-${file}`
                        };
                    });
                    
                    successMethod = 'yt-dlp with proxy';
                } catch (error) {
                    console.error('yt-dlp carousel error:', error.message);
                    
                    // Method 2: Try instaloader for carousel
                    if (shortcode) {
                        try {
                            console.log("Attempting carousel download with instaloader...");
                            
                            const instaloadDir = path.join(carouselDir, 'instaloader');
                            if (!fs.existsSync(instaloadDir)) {
                                fs.mkdirSync(instaloadDir, { recursive: true });
                            }
                            
                            const instaloaderCommand = `instaloader --no-metadata-json --no-captions --no-video-thumbnails --dirname-pattern="${instaloadDir}" -- "-${shortcode}"`;
                            
                            console.log(`Executing: ${instaloaderCommand}`);
                            execSync(instaloaderCommand, { stdio: 'inherit' });
                            
                            // Find the downloaded files
                            const instaloadFiles = fs.existsSync(instaloadDir) ? fs.readdirSync(instaloadDir) : [];
                            
                            if (instaloadFiles.length === 0) {
                                throw new Error("No files were downloaded by instaloader");
                            }
                            
                            // Process and move the downloaded files
                            let fileIndex = 1;
                            for (const file of instaloadFiles) {
                                if (file.endsWith('.json')) continue; // Skip JSON metadata files
                                
                                const sourcePath = path.join(instaloadDir, file);
                                const extension = path.extname(file).toLowerCase();
                                const newFilename = `${fileIndex}${extension}`;
                                const destPath = path.join(carouselDir, newFilename);
                                
                                fs.copyFileSync(sourcePath, destPath);
                                
                                const mediaType = ['.mp4', '.mov', '.webm'].includes(extension) ? 'video' : 'image';
                                
                                mediaItems.push({
                                    url: `/downloads/${carouselId}/${newFilename}`,
                                    type: mediaType,
                                    filename: `instagram-content-${Date.now()}-${newFilename}`
                                });
                                
                                fileIndex++;
                            }
                            
                            // Clean up the instaloader directory
                            fs.rmSync(instaloadDir, { recursive: true, force: true });
                            
                            successMethod = 'instaloader';
                        } catch (instaloaderError) {
                            console.error('Instaloader carousel error:', instaloaderError.message);
                            
                            // Clean up instaloader directory if it exists
                            if (fs.existsSync(path.join(carouselDir, 'instaloader'))) {
                                fs.rmSync(path.join(carouselDir, 'instaloader'), { recursive: true, force: true });
                            }
                            
                            // Method 3: Try direct extraction for carousel
                            try {
                                console.log("Attempting direct extraction for carousel...");
                                
                                mediaItems = await extractCarouselDirectly(url, carouselId, carouselDir);
                                
                                if (mediaItems && mediaItems.length > 0) {
                                    successMethod = 'direct extraction';
                                } else {
                                    throw new Error("Direct extraction failed for carousel");
                                }
                            } catch (directError) {
                                console.error('Direct carousel extraction error:', directError.message);
                                throw new Error("All carousel download methods failed");
                            }
                        }
                    } else {
                        // If we couldn't extract shortcode, try direct extraction
                        try {
                            console.log("Could not extract shortcode, trying direct carousel extraction...");
                            
                            mediaItems = await extractCarouselDirectly(url, carouselId, carouselDir);
                            
                            if (mediaItems && mediaItems.length > 0) {
                                successMethod = 'direct extraction';
                            } else {
                                throw new Error("Direct extraction failed for carousel");
                            }
                        } catch (directError) {
                            console.error('Direct carousel extraction error:', directError.message);
                            throw new Error("All carousel download methods failed");
                        }
                    }
                }
            }
            
            // If we have media items, return them
            if (mediaItems && mediaItems.length > 0) {
                console.log(`Successfully downloaded carousel using method: ${successMethod}`);
                return res.status(200).json({
                    success: true,
                    isCarousel: true,
                    mediaItems: mediaItems
                });
            } else {
                // Clean up the carousel directory if it exists
                if (fs.existsSync(carouselDir)) {
                    fs.rmSync(carouselDir, { recursive: true, force: true });
                }
                
                throw new Error("No carousel download method succeeded");
            }
        } else {
            return res.status(400).json({ success: false, message: 'URL is not a carousel post' });
        }
    } catch (error) {
        console.error('Multi-download error:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while processing multiple media items' 
        });
    }
});

// Function to extract carousel content directly
async function extractCarouselDirectly(url, carouselId, carouselDir) {
    try {
        // Fetch the Instagram page
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Try to find carousel items in script tags
        const scripts = $('script[type="text/javascript"]').toArray();
        let mediaItems = [];
        
        for (const script of scripts) {
            const content = $(script).html();
            if (!content) continue;
            
            // Look for carousel_media or edge_sidecar_to_children patterns
            if (content.includes('edge_sidecar_to_children') || content.includes('carousel_media')) {
                // Extract all image URLs
                const imageMatches = content.match(/"display_url":"([^"]+)"/g);
                if (imageMatches) {
                    for (let i = 0; i < imageMatches.length; i++) {
                        const url = imageMatches[i].match(/"display_url":"([^"]+)"/)[1].replace(/\\/g, '');
                        const filename = `img-${i + 1}.jpg`;
                        const outputPath = path.join(carouselDir, filename);
                        
                        // Download the image
                        try {
                            const imageResponse = await axios({
                                method: 'GET',
                                url: url,
                                responseType: 'stream'
                            });
                            
                            const writer = fs.createWriteStream(outputPath);
                            imageResponse.data.pipe(writer);
                            
                            await new Promise((resolve, reject) => {
                                writer.on('finish', resolve);
                                writer.on('error', reject);
                            });
                            
                            mediaItems.push({
                                url: `/downloads/${carouselId}/${filename}`,
                                type: 'image',
                                filename: `instagram-content-${Date.now()}-${filename}`
                            });
                        } catch (err) {
                            console.error(`Error downloading carousel image ${i+1}:`, err.message);
                            // Continue to next image even if one fails
                        }
                    }
                }
                
                // Extract all video URLs
                const videoMatches = content.match(/"video_url":"([^"]+)"/g);
                if (videoMatches) {
                    for (let i = 0; i < videoMatches.length; i++) {
                        const url = videoMatches[i].match(/"video_url":"([^"]+)"/)[1].replace(/\\/g, '');
                        const filename = `video-${i + 1}.mp4`;
                        const outputPath = path.join(carouselDir, filename);
                        
                        // Download the video
                        try {
                            const videoResponse = await axios({
                                method: 'GET',
                                url: url,
                                responseType: 'stream'
                            });
                            
                            const writer = fs.createWriteStream(outputPath);
                            videoResponse.data.pipe(writer);
                            
                            await new Promise((resolve, reject) => {
                                writer.on('finish', resolve);
                                writer.on('error', reject);
                            });
                            
                            mediaItems.push({
                                url: `/downloads/${carouselId}/${filename}`,
                                type: 'video',
                                filename: `instagram-content-${Date.now()}-${filename}`
                            });
                        } catch (err) {
                            console.error(`Error downloading carousel video ${i+1}:`, err.message);
                            // Continue to next video even if one fails
                        }
                    }
                }
                
                // If we found any items, break the loop
                if (mediaItems.length > 0) {
                    break;
                }
            }
        }
        
        return mediaItems;
    } catch (error) {
        console.error('Carousel direct extraction error:', error.message);
        return [];
    }
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});