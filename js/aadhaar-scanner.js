class AadhaarScanner {
    constructor() {
        this.stream = null;
        this.extractedData = null;
        this.canvas = null;
        this.context = null;
    }

    // Open the Aadhaar scanner modal
    openScanner() {
        document.getElementById('aadhaarScannerModal').classList.remove('hidden');
        this.resetScanner();
    }

    // Close the scanner modal
    closeScanner() {
        this.stopCamera();
        document.getElementById('aadhaarScannerModal').classList.add('hidden');
        this.resetScanner();
    }

    // Reset scanner state
    resetScanner() {
        document.getElementById('cameraFeed').classList.add('hidden');
        document.getElementById('captureCanvas').classList.add('hidden');
        document.getElementById('cameraPlaceholder').classList.remove('hidden');
        document.getElementById('processingStatus').classList.add('hidden');
        document.getElementById('extractedDataPreview').classList.add('hidden');
        document.getElementById('captureBtn').disabled = true;
        
        this.extractedData = null;
    }

    // Start camera feed
    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment' // Use back camera if available
                }
            });

            const video = document.getElementById('cameraFeed');
            video.srcObject = this.stream;
            
            video.onloadedmetadata = () => {
                document.getElementById('cameraPlaceholder').classList.add('hidden');
                video.classList.remove('hidden');
                document.getElementById('captureBtn').disabled = false;
            };

        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Unable to access camera. Please check permissions or try uploading an image instead.');
        }
    }

    // Stop camera feed
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    // Capture image from camera
    captureImage() {
        const video = document.getElementById('cameraFeed');
        const canvas = document.getElementById('captureCanvas');
        const context = canvas.getContext('2d');

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Hide video, show canvas
        video.classList.add('hidden');
        canvas.classList.remove('hidden');

        // Get image data and process
        canvas.toBlob((blob) => {
            this.processImage(blob);
        }, 'image/jpeg', 0.8);
    }

    // Handle uploaded image
    processUploadedImage(input) {
        const file = input.files[0];
        if (file) {
            this.processImage(file);
        }
    }

    // Validate image quality for OCR
    validateImageQuality(imageBlob) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const quality = {
                    isValid: true,
                    warnings: [],
                    width: img.width,
                    height: img.height,
                    aspectRatio: img.width / img.height
                };

                // Check minimum resolution
                if (img.width < 800 || img.height < 600) {
                    quality.warnings.push('Image resolution is low. Higher resolution images work better.');
                }

                // Check aspect ratio (Aadhaar cards are roughly 3.4:2.1)
                const expectedRatio = 3.4 / 2.1;
                const ratioDiff = Math.abs(quality.aspectRatio - expectedRatio) / expectedRatio;
                if (ratioDiff > 0.3) {
                    quality.warnings.push('Image aspect ratio suggests this might not be a full Aadhaar card.');
                }

                // Check file size (very small files might be low quality)
                if (imageBlob.size < 50000) { // Less than 50KB
                    quality.warnings.push('Image file size is small. Higher quality images work better.');
                }

                resolve(quality);
            };
            img.src = URL.createObjectURL(imageBlob);
        });
    }

    // Preprocess image for better OCR accuracy
    async preprocessImage(imageBlob) {
        return new Promise((resolve) => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            img.onload = () => {
                // Set canvas size
                canvas.width = img.width;
                canvas.height = img.height;
                
                // Draw original image
                ctx.drawImage(img, 0, 0);
                
                // Get image data for processing
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                
                // Apply image enhancements
                for (let i = 0; i < data.length; i += 4) {
                    // Convert to grayscale
                    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                    
                    // Apply contrast enhancement and thresholding
                    const enhanced = gray > 128 ? 255 : 0;
                    
                    data[i] = enhanced;     // Red
                    data[i + 1] = enhanced; // Green
                    data[i + 2] = enhanced; // Blue
                    // Alpha remains unchanged
                }
                
                // Put processed image data back
                ctx.putImageData(imageData, 0, 0);
                
                // Convert canvas to blob
                canvas.toBlob(resolve, 'image/png', 1.0);
            };
            
            img.src = URL.createObjectURL(imageBlob);
        });
    }

    // Process image with OCR
    async processImage(imageBlob) {
        try {
            // Show processing status
            document.getElementById('processingStatus').classList.remove('hidden');
            document.querySelector('#processingStatus span').textContent = 'Validating image quality...';

            // Validate image quality first
            const imageQuality = await this.validateImageQuality(imageBlob);
            
            // Show quality warnings if any
            if (imageQuality.warnings.length > 0) {
                const continueProcessing = confirm(
                    'Image quality issues detected:\n\n' + 
                    imageQuality.warnings.join('\n') + 
                    '\n\nDo you want to continue processing? For better results, try capturing a clearer image.'
                );
                if (!continueProcessing) {
                    document.getElementById('processingStatus').classList.add('hidden');
                    return;
                }
            }

            document.querySelector('#processingStatus span').textContent = 'Preprocessing image...';

            // Preprocess image for better accuracy
            const preprocessedBlob = await this.preprocessImage(imageBlob);
            
            // Create image URL for Tesseract
            const imageUrl = URL.createObjectURL(preprocessedBlob);

            // Configure Tesseract for better Aadhaar recognition
            const tesseractOptions = {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        document.querySelector('#processingStatus span').textContent = 
                            `Processing Aadhaar card... ${progress}%`;
                    }
                },
                // Tesseract configuration for better accuracy
                tessedit_pageseg_mode: '6', // Uniform block of text
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /-:.,',
                preserve_interword_spaces: '1'
            };

            // Run OCR with multiple language models for better accuracy
            const result = await Tesseract.recognize(imageUrl, 'eng', tesseractOptions);

            // Clean up URL
            URL.revokeObjectURL(imageUrl);

            console.log('Raw OCR Text:', result.data.text);
            console.log('OCR Confidence:', result.data.confidence);

            // Extract Aadhaar data from text with improved parsing
            this.extractedData = this.parseAadhaarTextAdvanced(result.data.text);

            // Validate extracted data
            this.validationResult = this.validateExtractedData(this.extractedData);

            // Hide processing status
            document.getElementById('processingStatus').classList.add('hidden');

            // Show extracted data
            this.displayExtractedData();

        } catch (error) {
            console.error('Error processing image:', error);
            document.getElementById('processingStatus').classList.add('hidden');
            alert('Error processing image. Please try again with a clearer image.');
        }
    }

    // Validate Aadhaar number using Verhoeff algorithm
    validateAadhaarNumber(aadhaarNumber) {
        if (!aadhaarNumber || aadhaarNumber.length !== 12) {
            return false;
        }

        // Verhoeff algorithm for Aadhaar validation
        const d = [
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
            [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
            [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
            [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
            [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
            [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
            [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
            [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
            [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
            [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
        ];

        const p = [
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
            [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
            [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
            [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
            [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
            [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
            [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
            [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
        ];

        let c = 0;
        const myArray = aadhaarNumber.split('').map(Number).reverse();

        for (let i = 0; i < myArray.length; i++) {
            c = d[c][p[((i + 1) % 8)][myArray[i]]];
        }

        return c === 0;
    }

    // Validate extracted data
    validateExtractedData(data) {
        const validation = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // Validate Aadhaar number
        if (data.aadhaarNumber) {
            if (!this.validateAadhaarNumber(data.aadhaarNumber)) {
                validation.errors.push('Invalid Aadhaar number format or checksum');
                validation.isValid = false;
            }
        } else {
            validation.warnings.push('Aadhaar number not detected');
        }

        // Validate name
        if (!data.name || data.name.length < 2) {
            validation.warnings.push('Name not clearly detected');
        }

        // Validate date of birth
        if (data.dateOfBirth) {
            const dob = new Date(data.dateOfBirth);
            const today = new Date();
            const age = today.getFullYear() - dob.getFullYear();
            
            if (age < 0 || age > 120) {
                validation.errors.push('Invalid date of birth');
                validation.isValid = false;
            }
        } else {
            validation.warnings.push('Date of birth not detected');
        }

        // Validate gender
        if (!data.gender) {
            validation.warnings.push('Gender not detected');
        }

        // Validate mobile number
        if (data.mobileNumber && !/^[6-9]\d{9}$/.test(data.mobileNumber)) {
            validation.errors.push('Invalid mobile number format');
            validation.isValid = false;
        }

        return validation;
    }

    // Parse Aadhaar text and extract relevant information
    parseAadhaarText(text) {
        console.log('OCR Text:', text); // For debugging

        const data = {
            name: '',
            dateOfBirth: '',
            gender: '',
            address: '',
            aadhaarNumber: '',
            fatherName: '',
            mobileNumber: ''
        };

        // Clean and normalize text
        const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        // Extract Aadhaar number (12 digits, possibly with spaces)
        const aadhaarMatch = cleanText.match(/(\d{4}\s*\d{4}\s*\d{4})/);
        if (aadhaarMatch) {
            data.aadhaarNumber = aadhaarMatch[1].replace(/\s/g, '');
        }

        // Extract date of birth (various formats)
        const dobPatterns = [
            /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
            /(\d{1,2}\s+\d{1,2}\s+\d{4})/,
            /DOB[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
            /Birth[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i
        ];

        for (const pattern of dobPatterns) {
            const match = cleanText.match(pattern);
            if (match) {
                data.dateOfBirth = this.formatDate(match[1]);
                break;
            }
        }

        // Extract gender
        const genderMatch = cleanText.match(/(Male|Female|MALE|FEMALE|M|F|पुरुष|महिला)/i);
        if (genderMatch) {
            const gender = genderMatch[1].toLowerCase();
            if (gender === 'male' || gender === 'm' || gender === 'पुरुष') {
                data.gender = 'Male';
            } else if (gender === 'female' || gender === 'f' || gender === 'महिला') {
                data.gender = 'Female';
            }
        }

        // Extract name (usually appears after "Name:" or is the largest text)
        const namePatterns = [
            /Name[:\s]+([A-Za-z\s]+?)(?:\s+(?:DOB|Date|Birth|Gender|Male|Female|\d))/i,
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/
        ];

        for (const pattern of namePatterns) {
            const match = cleanText.match(pattern);
            if (match && match[1].length > 3 && match[1].length < 50) {
                data.name = match[1].trim();
                break;
            }
        }

        // If no name found with patterns, try to extract from lines
        if (!data.name) {
            for (const line of lines) {
                // Skip lines with numbers or common Aadhaar text
                if (!/\d/.test(line) && 
                    !line.match(/government|india|aadhaar|unique|identification/i) &&
                    line.length > 3 && line.length < 50) {
                    data.name = line;
                    break;
                }
            }
        }

        // Extract father's name
        const fatherPatterns = [
            /(?:Father|S\/O|Son of)[:\s]+([A-Za-z\s]+?)(?:\s+(?:DOB|Date|Birth|Address|\d))/i,
            /S\/O[:\s]+([A-Za-z\s]+)/i
        ];

        for (const pattern of fatherPatterns) {
            const match = cleanText.match(pattern);
            if (match && match[1].length > 3) {
                data.fatherName = match[1].trim();
                break;
            }
        }

        // Extract mobile number
        const mobileMatch = cleanText.match(/(\d{10})/);
        if (mobileMatch) {
            data.mobileNumber = mobileMatch[1];
        }

        // Extract address (more complex, usually multiple lines)
        const addressLines = lines.filter(line => 
            !line.match(/\d{12}/) && // Not Aadhaar number
            !line.match(/male|female/i) && // Not gender
            !line.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/) && // Not DOB
            !line.match(/government|india|aadhaar|unique/i) && // Not header text
            line.length > 10
        );

        if (addressLines.length > 0) {
            data.address = addressLines.slice(-2).join(', '); // Take last 2 lines as address
        }

        return data;
    }

    // Advanced Aadhaar text parsing with improved accuracy
    parseAadhaarTextAdvanced(text) {
        console.log('OCR Text:', text); // For debugging

        const data = {
            name: '',
            dateOfBirth: '',
            gender: '',
            address: '',
            aadhaarNumber: '',
            fatherName: '',
            mobileNumber: ''
        };

        // Clean and normalize text - more aggressive cleaning
        let cleanText = text.replace(/[^\w\s\/\-\.\:]/g, ' '); // Remove special chars except common ones
        cleanText = cleanText.replace(/\s+/g, ' ').trim(); // Normalize spaces
        cleanText = cleanText.replace(/[Il1|]/g, '1'); // Fix common OCR mistakes
        cleanText = cleanText.replace(/[O0]/g, '0'); // Fix O/0 confusion
        
        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 2)
            .map(line => line.replace(/[^\w\s\/\-\.\:]/g, ' ').replace(/\s+/g, ' ').trim());

        console.log('Cleaned lines:', lines);

        // Extract Aadhaar number with improved patterns
        const aadhaarPatterns = [
            /(\d{4}\s*\d{4}\s*\d{4})/g,
            /(\d{12})/g,
            /(\d{4}[\s\-]\d{4}[\s\-]\d{4})/g
        ];

        for (const pattern of aadhaarPatterns) {
            const matches = cleanText.match(pattern);
            if (matches) {
                for (const match of matches) {
                    const cleaned = match.replace(/\D/g, '');
                    if (cleaned.length === 12 && this.validateAadhaarNumber(cleaned)) {
                        data.aadhaarNumber = cleaned;
                        break;
                    }
                }
                if (data.aadhaarNumber) break;
            }
        }

        // Extract date of birth with multiple patterns
        const dobPatterns = [
            /(?:DOB|Date of Birth|Birth Date)[\s\:]*(\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{4})/i,
            /(\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{4})/g,
            /(\d{1,2}\s+\d{1,2}\s+\d{4})/g
        ];

        for (const pattern of dobPatterns) {
            const matches = cleanText.match(pattern);
            if (matches) {
                for (const match of matches) {
                    const dateStr = pattern.global ? match : matches[1];
                    const formatted = this.formatDate(dateStr);
                    if (formatted) {
                        // Validate the date makes sense (not future, reasonable age)
                        const date = new Date(formatted);
                        const age = new Date().getFullYear() - date.getFullYear();
                        if (age >= 0 && age <= 120) {
                            data.dateOfBirth = formatted;
                            break;
                        }
                    }
                }
                if (data.dateOfBirth) break;
            }
        }

        // Extract gender with improved patterns
        const genderPatterns = [
            /(?:Gender|Sex)[\s\:]*([MF]ale?|[MF])/i,
            /(Male|Female|MALE|FEMALE|पुरुष|महिला)/i,
            /\b([MF])\b/g
        ];

        for (const pattern of genderPatterns) {
            const match = cleanText.match(pattern);
            if (match) {
                const gender = match[1].toLowerCase();
                if (gender.includes('m') || gender === 'पुरुष') {
                    data.gender = 'Male';
                    break;
                } else if (gender.includes('f') || gender === 'महिला') {
                    data.gender = 'Female';
                    break;
                }
            }
        }

        // Extract name with improved logic
        const namePatterns = [
            /(?:Name)[\s\:]+([A-Za-z\s]{3,50}?)(?:\s+(?:DOB|Date|Birth|Gender|Male|Female|\d))/i,
            /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/m, // First line with proper case
        ];

        // Try structured name extraction first
        for (const pattern of namePatterns) {
            const match = cleanText.match(pattern);
            if (match && match[1]) {
                const name = match[1].trim();
                if (name.length > 2 && name.length < 50 && !name.match(/\d/)) {
                    data.name = name;
                    break;
                }
            }
        }

        // If no name found, try line-by-line analysis
        if (!data.name) {
            for (const line of lines) {
                // Skip lines with common Aadhaar keywords or numbers
                if (line.match(/government|india|aadhaar|unique|identification|dob|birth|gender/i) ||
                    line.match(/\d{4}/) || line.length < 3 || line.length > 50) {
                    continue;
                }
                
                // Look for lines that look like names (proper case, no numbers)
                if (line.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/)) {
                    data.name = line;
                    break;
                }
            }
        }

        // Extract mobile number with validation
        const mobilePatterns = [
            /(?:Mobile|Phone|Contact)[\s\:]*([6-9]\d{9})/i,
            /\b([6-9]\d{9})\b/g
        ];

        for (const pattern of mobilePatterns) {
            const matches = cleanText.match(pattern);
            if (matches) {
                for (const match of matches) {
                    const mobile = pattern.global ? match : matches[1];
                    if (/^[6-9]\d{9}$/.test(mobile)) {
                        data.mobileNumber = mobile;
                        break;
                    }
                }
                if (data.mobileNumber) break;
            }
        }

        // Extract father's name
        const fatherPatterns = [
            /(?:Father|S\/O|Son of|Father's Name)[\s\:]+([A-Za-z\s]{3,50}?)(?:\s+(?:DOB|Date|Birth|Address|\d))/i,
            /S\/O[\s\:]*([A-Za-z\s]{3,40})/i
        ];

        for (const pattern of fatherPatterns) {
            const match = cleanText.match(pattern);
            if (match && match[1]) {
                const name = match[1].trim();
                if (name.length > 2 && name.length < 50 && !name.match(/\d/)) {
                    data.fatherName = name;
                    break;
                }
            }
        }

        // Extract address - look for longer text blocks without specific keywords
        const addressCandidates = lines.filter(line => 
            line.length > 15 && 
            !line.match(/\d{12}/) && // Not Aadhaar number
            !line.match(/male|female|dob|birth|government|india|aadhaar/i) && // Not other fields
            !line.match(/\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{4}/) // Not DOB
        );

        if (addressCandidates.length > 0) {
            // Take the longest line as address, or combine multiple if they seem related
            data.address = addressCandidates
                .slice(-2) // Take last 2 lines
                .join(', ')
                .substring(0, 200); // Limit length
        }

        // Post-processing cleanup
        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'string') {
                data[key] = data[key].trim();
            }
        });

        console.log('Extracted data:', data);
        return data;
    }

    // Format date for HTML date input
    formatDate(dateStr) {
        try {
            // Handle various date formats
            let date;
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts[2].length === 4) {
                    date = new Date(parts[2], parts[1] - 1, parts[0]); // DD/MM/YYYY
                } else {
                    date = new Date(parts[0], parts[1] - 1, parts[2]); // MM/DD/YY
                }
            } else if (dateStr.includes('-')) {
                date = new Date(dateStr);
            } else {
                const parts = dateStr.split(/\s+/);
                if (parts.length === 3) {
                    date = new Date(parts[2], parts[1] - 1, parts[0]);
                }
            }

            if (date && !isNaN(date.getTime())) {
                return date.toISOString().split('T')[0]; // YYYY-MM-DD format
            }
        } catch (error) {
            console.error('Error formatting date:', error);
        }
        return '';
    }

    // Display extracted data for review
    displayExtractedData() {
        const content = document.getElementById('extractedDataContent');
        const data = this.extractedData;
        const validation = this.validationResult;

        let validationHtml = '';
        
        // Show validation errors and warnings
        if (validation.errors.length > 0 || validation.warnings.length > 0) {
            validationHtml = '<div class="mb-4">';
            
            if (validation.errors.length > 0) {
                validationHtml += `
                    <div class="mb-2">
                        <div class="flex items-center space-x-2 text-red-600 mb-1">
                            <i class="ri-error-warning-line"></i>
                            <span class="font-medium">Validation Errors:</span>
                        </div>
                        <ul class="list-disc list-inside text-sm text-red-600 ml-6">
                            ${validation.errors.map(error => `<li>${error}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            if (validation.warnings.length > 0) {
                validationHtml += `
                    <div class="mb-2">
                        <div class="flex items-center space-x-2 text-yellow-600 mb-1">
                            <i class="ri-alert-line"></i>
                            <span class="font-medium">Warnings:</span>
                        </div>
                        <ul class="list-disc list-inside text-sm text-yellow-600 ml-6">
                            ${validation.warnings.map(warning => `<li>${warning}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            validationHtml += '</div>';
        }

        content.innerHTML = validationHtml + `
            <div class="mb-4">
                <div class="flex items-center justify-between mb-3">
                    <h5 class="font-medium text-gray-800">Extracted Data</h5>
                    <button onclick="toggleEditMode()" id="editModeBtn" 
                        class="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg transition">
                        <i class="ri-edit-line mr-1"></i>Edit
                    </button>
                </div>
                
                <!-- Read-only view -->
                <div id="readOnlyView" class="grid grid-cols-2 gap-4">
                    <div>
                        <span class="font-medium text-gray-700">Name:</span>
                        <span class="ml-2 ${data.name ? 'text-green-600' : 'text-gray-400'}">${data.name || 'Not found'}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">Date of Birth:</span>
                        <span class="ml-2 ${data.dateOfBirth ? 'text-green-600' : 'text-gray-400'}">${data.dateOfBirth || 'Not found'}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">Gender:</span>
                        <span class="ml-2 ${data.gender ? 'text-green-600' : 'text-gray-400'}">${data.gender || 'Not found'}</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">Aadhaar Number:</span>
                        <span class="ml-2 ${data.aadhaarNumber && this.validateAadhaarNumber(data.aadhaarNumber) ? 'text-green-600' : data.aadhaarNumber ? 'text-red-600' : 'text-gray-400'}">${data.aadhaarNumber || 'Not found'}</span>
                    </div>
                    <div class="col-span-2">
                        <span class="font-medium text-gray-700">Father's Name:</span>
                        <span class="ml-2 ${data.fatherName ? 'text-green-600' : 'text-gray-400'}">${data.fatherName || 'Not found'}</span>
                    </div>
                    <div class="col-span-2">
                        <span class="font-medium text-gray-700">Mobile:</span>
                        <span class="ml-2 ${data.mobileNumber && /^[6-9]\d{9}$/.test(data.mobileNumber) ? 'text-green-600' : data.mobileNumber ? 'text-red-600' : 'text-gray-400'}">${data.mobileNumber || 'Not found'}</span>
                    </div>
                    <div class="col-span-2">
                        <span class="font-medium text-gray-700">Address:</span>
                        <span class="ml-2 ${data.address ? 'text-green-600' : 'text-gray-400'}">${data.address || 'Not found'}</span>
                    </div>
                </div>

                <!-- Editable view -->
                <div id="editableView" class="hidden grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Name:</label>
                        <input type="text" id="edit_name" value="${data.name || ''}" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Date of Birth:</label>
                        <input type="date" id="edit_dob" value="${data.dateOfBirth || ''}" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Gender:</label>
                        <select id="edit_gender" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                            <option value="">Select Gender</option>
                            <option value="Male" ${data.gender === 'Male' ? 'selected' : ''}>Male</option>
                            <option value="Female" ${data.gender === 'Female' ? 'selected' : ''}>Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Aadhaar Number:</label>
                        <input type="text" id="edit_aadhaar" value="${data.aadhaarNumber || ''}" 
                            maxlength="12" pattern="[0-9]{12}"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Father's Name:</label>
                        <input type="text" id="edit_father" value="${data.fatherName || ''}" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Mobile:</label>
                        <input type="tel" id="edit_mobile" value="${data.mobileNumber || ''}" 
                            maxlength="10" pattern="[6-9][0-9]{9}"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Address:</label>
                        <textarea id="edit_address" rows="2" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">${data.address || ''}</textarea>
                    </div>
                    <div class="col-span-2 flex justify-end space-x-2 mt-2">
                        <button onclick="cancelEdit()" 
                            class="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                            Cancel
                        </button>
                        <button onclick="saveEdits()" 
                            class="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('extractedDataPreview').classList.remove('hidden');
    }

    // Fill patient form with extracted data
    fillPatientForm() {
        if (!this.extractedData) return;

        const data = this.extractedData;
        const validation = this.validationResult;

        // Show warning if there are validation errors
        if (validation && !validation.isValid) {
            const confirmFill = confirm(
                'There are validation errors in the extracted data. Do you want to proceed anyway? ' +
                'Please review the filled data carefully.'
            );
            if (!confirmFill) return;
        }

        // Split name into first and last name
        if (data.name) {
            const nameParts = data.name.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            document.getElementById('firstName').value = firstName;
            document.getElementById('lastName').value = lastName;
        }

        // Fill date of birth
        if (data.dateOfBirth) {
            document.getElementById('dateOfBirth').value = data.dateOfBirth;
        }

        // Fill gender
        if (data.gender) {
            document.getElementById('gender').value = data.gender;
        }

        // Fill contact number (only if valid)
        if (data.mobileNumber && /^[6-9]\d{9}$/.test(data.mobileNumber)) {
            document.getElementById('contactNumber').value = data.mobileNumber;
        }

        // Close scanner modal
        this.closeScanner();

        // Show appropriate message based on validation
        if (validation && validation.isValid) {
            this.showNotification('Aadhaar data filled successfully! Please review and complete remaining fields.', 'success');
        } else {
            this.showNotification('Aadhaar data filled with warnings. Please review all fields carefully.', 'info');
        }
    }

    // Show notification
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transition-all duration-300 ${
            type === 'success' ? 'bg-green-600 text-white' : 
            type === 'error' ? 'bg-red-600 text-white' : 
            'bg-blue-600 text-white'
        }`;
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="ri-${type === 'success' ? 'check' : type === 'error' ? 'error-warning' : 'information'}-line"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
}

// Initialize scanner
const aadhaarScanner = new AadhaarScanner();

// Global functions for HTML onclick handlers
function openAadhaarScanner() {
    aadhaarScanner.openScanner();
}

function closeAadhaarScanner() {
    aadhaarScanner.closeScanner();
}

function startCamera() {
    aadhaarScanner.startCamera();
}

function captureImage() {
    aadhaarScanner.captureImage();
}

function uploadImage() {
    document.getElementById('imageUpload').click();
}

function processUploadedImage(input) {
    aadhaarScanner.processUploadedImage(input);
}

function fillPatientForm() {
    aadhaarScanner.fillPatientForm();
}

// Edit mode functions
function toggleEditMode() {
    const readOnlyView = document.getElementById('readOnlyView');
    const editableView = document.getElementById('editableView');
    const editBtn = document.getElementById('editModeBtn');
    
    if (readOnlyView.classList.contains('hidden')) {
        // Switch to read-only mode
        readOnlyView.classList.remove('hidden');
        editableView.classList.add('hidden');
        editBtn.innerHTML = '<i class="ri-edit-line mr-1"></i>Edit';
    } else {
        // Switch to edit mode
        readOnlyView.classList.add('hidden');
        editableView.classList.remove('hidden');
        editBtn.innerHTML = '<i class="ri-eye-line mr-1"></i>View';
    }
}

function cancelEdit() {
    toggleEditMode();
}

function saveEdits() {
    // Update the extracted data with edited values
    aadhaarScanner.extractedData = {
        name: document.getElementById('edit_name').value.trim(),
        dateOfBirth: document.getElementById('edit_dob').value,
        gender: document.getElementById('edit_gender').value,
        address: document.getElementById('edit_address').value.trim(),
        aadhaarNumber: document.getElementById('edit_aadhaar').value.replace(/\D/g, ''),
        fatherName: document.getElementById('edit_father').value.trim(),
        mobileNumber: document.getElementById('edit_mobile').value.replace(/\D/g, '')
    };
    
    // Re-validate the data
    aadhaarScanner.validationResult = aadhaarScanner.validateExtractedData(aadhaarScanner.extractedData);
    
    // Re-display the data
    aadhaarScanner.displayExtractedData();
    
    // Show success message
    aadhaarScanner.showNotification('Data updated successfully!', 'success');
}
