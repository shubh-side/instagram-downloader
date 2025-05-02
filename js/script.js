document.addEventListener('DOMContentLoaded', () => {
    const reelUrlInput = document.getElementById('reelUrl');
    const downloadBtn = document.getElementById('downloadBtn');
    const status = document.getElementById('status');
    const downloadArea = document.getElementById('downloadArea');
    const videoPreview = document.getElementById('videoPreview');
    const imagePreview = document.getElementById('imagePreview');
    const downloadLink = document.getElementById('downloadLink');
    const downloadAllContainer = document.getElementById('downloadAllContainer');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    
    // Keep track of current URL for carousel downloads
    let currentUrl = '';

    // Store the last URL type to provide better error messages
    window.lastUrlType = null;

    // Handle Enter key press
    reelUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            downloadBtn.click();
        }
    });

    // Handle download button click
    // Handle download button click
    // Handle download button click
    downloadBtn.addEventListener('click', async () => {
        const url = reelUrlInput.value.trim();
        currentUrl = url; // Store for later use
        
        if (!validateAndDetectUrlType(url)) {
            return;
        }

        try {
            // Show loading status with different messages based on content type
            if (window.lastUrlType === 'story') {
                showStatus('<div class="loading"></div> Downloading story... This may take a moment. Stories may require multiple attempts.', 'loading');
            } else {
                showStatus('<div class="loading"></div> Downloading content... This may take a moment.', 'loading');
            }
            
            // Reset display elements and clear ALL previous content
            resetDisplay();
            
            // Force a DOM refresh - critical for clearing cached state
            setTimeout(() => {
                // Check if it's a post URL that might contain multiple items
                if (window.lastUrlType === 'post') {
                    // Show the "Download All" button for potential carousel posts
                    downloadAllContainer.classList.remove('hidden');
                    downloadAllBtn.setAttribute('data-url', url);
                } else {
                    downloadAllContainer.classList.add('hidden');
                }

                // Send request to the server
                fetch('/api/download', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url })
                })
                .then(response => response.json())
                .then(data => {
                    if (!data.success) {
                        throw new Error(data.message || 'Failed to download the content');
                    }
                    
                    // Check if the result is a carousel
                    if (data.isCarousel && data.carouselItems && data.carouselItems.length > 1) {
                        // Handle carousel response differently
                        handleMultipleItemsResponse(data);
                    } else {
                        // Handle single item response
                        handleSingleItemResponse(data);
                    }
                })
                .catch(error => {
                    showDetailedError(error.message || 'An error occurred while downloading the content');
                });
            }, 50); // Small timeout to ensure DOM is fully cleared
            
        } catch (error) {
            showDetailedError(error.message || 'An error occurred while downloading the content');
        }
    });

    // Function to handle single item response (video or image)
    function handleSingleItemResponse(data) {
        // Show success status with content type indication
        const contentType = data.mediaType === 'video' ? 'video' : 'image';
        showStatus(`${capitalizeFirstLetter(contentType)} downloaded successfully!`, 'success');
        
        // Completely reset and clear the download area first
        downloadArea.innerHTML = '';
        
        // Display the download area
        downloadArea.classList.remove('hidden');
        
        // Create fresh preview elements for this content
        if (data.mediaType === 'video') {
            // Create a new video element
            const videoElem = document.createElement('video');
            videoElem.controls = true;
            videoElem.src = data.mediaUrl;
            videoElem.className = 'preview-media';
            
            // Create a container for the video
            const previewContainer = document.createElement('div');
            previewContainer.className = 'preview-container';
            previewContainer.appendChild(videoElem);
            
            // Create a download link
            const downloadBtn = document.createElement('a');
            downloadBtn.href = data.mediaUrl;
            downloadBtn.download = data.filename || `instagram-content-${Date.now()}.mp4`;
            downloadBtn.className = 'download-button';
            downloadBtn.textContent = `Download ${capitalizeFirstLetter(contentType)}`;
            
            // Add elements to download area
            downloadArea.appendChild(previewContainer);
            downloadArea.appendChild(downloadBtn);
        } else {
            // Create a new image element
            const imgElem = document.createElement('img');
            imgElem.src = data.mediaUrl;
            imgElem.className = 'preview-media';
            
            // Create a container for the image
            const previewContainer = document.createElement('div');
            previewContainer.className = 'preview-container';
            previewContainer.appendChild(imgElem);
            
            // Create a download link
            const downloadBtn = document.createElement('a');
            downloadBtn.href = data.mediaUrl;
            downloadBtn.download = data.filename || `instagram-content-${Date.now()}.jpg`;
            downloadBtn.className = 'download-button';
            downloadBtn.textContent = `Download ${capitalizeFirstLetter(contentType)}`;
            
            // Add elements to download area
            downloadArea.appendChild(previewContainer);
            downloadArea.appendChild(downloadBtn);
        }
    }

    // Helper function to reset display elements
    function resetDisplay() {
        // Hide and clear the download area
        downloadArea.classList.add('hidden');
        downloadArea.innerHTML = '';
        
        // Hide the download all container
        downloadAllContainer.classList.add('hidden');
        
        // Reset status
        status.innerHTML = '';
        status.className = 'status';
    }

    // Function to handle multiple items response (carousel or story)
    // Function to handle multiple items response (carousel or story)
    // Function to handle multiple items response (carousel or story)
    function handleMultipleItemsResponse(data) {
        // Show success status
        showStatus(`Found ${data.carouselCount} items in this post! First item downloaded successfully.`, 'success');
        
        // Clear download area and make it visible
        downloadArea.classList.remove('hidden');
        downloadArea.innerHTML = '';
        
        // Add carousel items section
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
            
            // Create the thumbnail container with fixed aspect ratio
            const thumbnailContainer = document.createElement('div');
            thumbnailContainer.className = 'thumbnail-container';
            
            // Add thumbnail image 
            const thumbnail = document.createElement('img');
            thumbnail.className = 'thumbnail';
            
            // Determine what to use as thumbnail
            if (item.thumbnailUrl && item.thumbnailUrl.startsWith('/downloads/')) {
                // This is a local file - use it directly
                thumbnail.src = item.thumbnailUrl;
                console.log(`Using local thumbnail: ${item.thumbnailUrl} for item ${item.index}`);
            } else if (item.thumbnailUrl && item.thumbnailUrl.length > 10) {
                // This is a remote URL - use it
                thumbnail.src = item.thumbnailUrl;
                console.log(`Using remote thumbnail: ${item.thumbnailUrl.substring(0, 50)}... for item ${item.index}`);
            } else {
                // Use placeholder for missing thumbnails
                console.log(`No thumbnail available for item ${item.index}, using placeholder`);
                thumbnail.src = `https://via.placeholder.com/300x300/0095f6/ffffff?text=${item.type.toUpperCase()}`;
            }
            
            // Handle thumbnail loading errors
            thumbnail.onerror = function() {
                console.log(`Thumbnail failed to load for item ${item.index}, using placeholder`);
                this.src = `https://via.placeholder.com/300x300/0095f6/ffffff?text=${item.type.toUpperCase()}`;
                
                // Special case for first item in a story
                if (data.isStory && item.index === 1 && data.mediaUrl) {
                    console.log(`Trying main media URL for first story item: ${data.mediaUrl}`);
                    this.src = data.mediaUrl;
                }
            };
            
            thumbnailContainer.appendChild(thumbnail);
            
            // Add type badge (VIDEO or IMAGE)
            const typeSpan = document.createElement('span');
            typeSpan.className = 'item-type';
            typeSpan.textContent = item.type.toUpperCase();
            thumbnailContainer.appendChild(typeSpan);
            
            itemElement.appendChild(thumbnailContainer);
            
            // Add download button
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'download-item-btn';
            downloadBtn.setAttribute('data-index', item.index);
            downloadBtn.setAttribute('data-id', item.uniqueId);
            downloadBtn.textContent = `Download Item ${item.index}`;
            itemElement.appendChild(downloadBtn);
            
            grid.appendChild(itemElement);
        });
        
        carouselSection.appendChild(grid);
        downloadArea.appendChild(carouselSection);
        
        // Add event listeners to download buttons
        document.querySelectorAll('.download-item-btn').forEach(button => {
            button.addEventListener('click', function() {
                const index = this.getAttribute('data-index');
                const uniqueId = this.getAttribute('data-id');
                downloadCarouselItem(currentUrl, index, uniqueId);
            });
        });
    }

    function handleCarouselResponse(data) {
        // Show success status
        showStatus(`Found ${data.carouselCount} items in this post! First item downloaded successfully.`, 'success');
        
        // Clear download area and make it visible
        downloadArea.classList.remove('hidden');
        downloadArea.innerHTML = '';
        
        // Add carousel items section
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
            
            // Create the thumbnail container with fixed aspect ratio
            const thumbnailContainer = document.createElement('div');
            thumbnailContainer.className = 'thumbnail-container';
            
            // Add thumbnail image
            const thumbnail = document.createElement('img');
            thumbnail.className = 'thumbnail';
            thumbnail.src = item.thumbnailUrl || data.mediaUrl; // Use the main media URL as fallback
            thumbnailContainer.appendChild(thumbnail);
            
            // Add type badge (VIDEO or IMAGE)
            const typeSpan = document.createElement('span');
            typeSpan.className = 'item-type';
            typeSpan.textContent = item.type.toUpperCase();
            thumbnailContainer.appendChild(typeSpan);
            
            itemElement.appendChild(thumbnailContainer);
            
            // Add download button
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'download-item-btn';
            downloadBtn.setAttribute('data-index', item.index);
            downloadBtn.setAttribute('data-id', item.uniqueId);
            downloadBtn.textContent = `Download Item ${item.index}`;
            itemElement.appendChild(downloadBtn);
            
            grid.appendChild(itemElement);
        });
        
        carouselSection.appendChild(grid);
        downloadArea.appendChild(carouselSection);
        
        // Add event listeners to download buttons
        document.querySelectorAll('.download-item-btn').forEach(button => {
            button.addEventListener('click', function() {
                const index = this.getAttribute('data-index');
                const uniqueId = this.getAttribute('data-id');
                downloadCarouselItem(currentUrl, index, uniqueId);
            });
        });
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
                showStatus(data.message || 'Download failed', 'error');
            }
        } catch (error) {
            console.error('Error downloading item:', error);
            showStatus('Failed to download item', 'error');
        }
    }

    // Handle "Download All" button for carousel posts
    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', async () => {
            const url = downloadAllBtn.getAttribute('data-url');
            
            if (!url) {
                showStatus('Invalid URL for carousel download', 'error');
                return;
            }
            
            try {
                // Show loading status
                showStatus('<div class="loading"></div> Downloading all content... This may take a moment.', 'loading');
                
                // Reset display elements
                resetDisplay();
                
                // Send request to download all items in the carousel
                const response = await fetch('/api/download-all', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.message || 'Failed to download carousel content');
                }
                
                if (data.isCarousel && data.mediaItems && data.mediaItems.length > 0) {
                    // Create a carousel container
                    const carouselContainer = document.createElement('div');
                    carouselContainer.className = 'carousel-container';
                    
                    // Add each media item to the carousel
                    data.mediaItems.forEach((item, index) => {
                        const itemContainer = document.createElement('div');
                        itemContainer.className = 'carousel-item';
                        
                        if (item.type === 'video') {
                            const video = document.createElement('video');
                            video.className = 'preview-media';
                            video.controls = true;
                            video.src = item.url;
                            itemContainer.appendChild(video);
                        } else {
                            const img = document.createElement('img');
                            img.className = 'preview-media';
                            img.src = item.url;
                            itemContainer.appendChild(img);
                        }
                        
                        const downloadBtn = document.createElement('a');
                        downloadBtn.className = 'download-button';
                        downloadBtn.href = item.url;
                        downloadBtn.download = item.filename;
                        downloadBtn.textContent = `Download ${capitalizeFirstLetter(item.type)} ${index + 1}`;
                        itemContainer.appendChild(downloadBtn);
                        
                        carouselContainer.appendChild(itemContainer);
                    });
                    
                    // Add the carousel to the download area
                    downloadArea.innerHTML = '';
                    downloadArea.appendChild(carouselContainer);
                    downloadArea.classList.remove('hidden');
                    
                    showStatus(`Downloaded ${data.mediaItems.length} items successfully!`, 'success');
                } else {
                    throw new Error('No carousel items found');
                }
                
            } catch (error) {
                showDetailedError(error.message || 'An error occurred while downloading carousel content');
            }
        });
    }

    // Enhanced error handling and user feedback for story downloads
    function showDetailedError(message) {
        const errorMessages = {
            'Could not extract media from the provided URL': 'Unable to download this content. It might be private or expired.',
            'No download method succeeded': 'Download failed. This content might require login or is no longer available.',
            'All download methods failed': 'Content download failed after multiple attempts.',
            'All story download methods failed': 'Story download failed. Stories may have expired or might be from a private account.',
            'Failed to fetch from FastSaverAPI': 'External API service failed to download this content.',
            'Story not available or expired': 'This story is no longer available or has expired.',
            'No file was downloaded': 'No media could be downloaded from this URL.',
            'Invalid Instagram URL': 'Please enter a valid Instagram URL (reel, post, or story).'
        };

        // Find a matching error message or use the original
        let detailedMessage = message;
        for (const [errorKey, errorValue] of Object.entries(errorMessages)) {
            if (message.includes(errorKey)) {
                detailedMessage = errorValue;
                break;
            }
        }

        // Special case for stories
        if ((message.toLowerCase().includes('story') || window.lastUrlType === 'story') && 
            !message.includes('specific error')) {
            detailedMessage += '<div class="error-tips">' +
                '<p><strong>Tips for downloading stories:</strong></p>' +
                '<ul>' +
                '<li>Make sure the story is still available (stories expire after 24 hours)</li>' +
                '<li>Only public stories can be downloaded without login</li>' +
                '<li>Try refreshing the page and attempting again</li>' +
                '</ul>' +
                '</div>';
        }

        showStatus(detailedMessage, 'error');
    }

    // Enhanced URL validation with type detection
    function validateAndDetectUrlType(url) {
        // Basic validation
        if (!url) {
            showStatus('Please enter an Instagram URL', 'error');
            return false;
        }
        
        if (!isValidInstagramUrl(url)) {
            showStatus('Please enter a valid Instagram URL (reel, post, or story)', 'error');
            return false;
        }
        
        // Detect and store URL type
        window.lastUrlType = getContentTypeFromUrl(url);
        
        // Special warning for stories
        if (window.lastUrlType === 'story') {
            showStatus('Attempting to download story... Note that stories must be public and not expired.', 'info');
        }
        
        return true;
    }

    // Helper function to determine content type from URL
    function getContentTypeFromUrl(url) {
        if (url.includes('/reel/') || url.includes('/tv/')) {
            return 'reel';
        } else if (url.includes('/stories/') || url.includes('/highlights/') || url.includes('instagram.com/s/')) {
            return 'story';
        } else if (url.includes('/p/')) {
            return 'post';
        } else {
            return 'unknown';
        }
    }

    // Helper function to show status messages
    function showStatus(message, type = 'info') {
        status.innerHTML = message;
        status.className = 'status';
        status.classList.add(type);
    }

    // Validate Instagram URL
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

    // Helper function to capitalize first letter
    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
});