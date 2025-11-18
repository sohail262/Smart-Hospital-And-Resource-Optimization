// Utility functions and helpers

const Utils = {
    // Date and time formatting
    formatDate(date) {
        if (!date) return 'N/A';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    },

    formatDateTime(date) {
        if (!date) return 'N/A';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    formatTime(date) {
        if (!date) return 'N/A';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleTimeString('en-US', { 
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Number formatting
    formatNumber(num) {
        return new Intl.NumberFormat('en-US').format(num);
    },

    formatPercent(num) {
        return `${Math.round(num)}%`;
    },

    formatCurrency(num) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(num);
    },

    // Data validation
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    validatePhone(phone) {
        const re = /^\+?[\d\s-()]+$/;
        return re.test(phone) && phone.replace(/\D/g, '').length >= 10;
    },

    // String utilities
    truncate(str, length = 50) {
        if (str.length <= length) return str;
        return str.substring(0, length) + '...';
    },

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    // Color utilities
    getStatusColor(status) {
        const colors = {
            active: 'green',
            inactive: 'gray',
            pending: 'yellow',
            completed: 'blue',
            critical: 'red',
            warning: 'orange'
        };
        return colors[status.toLowerCase()] || 'gray';
    },

    // Chart color generator
    generateChartColors(count) {
        const baseColors = [
            'rgb(59, 130, 246)',   // blue
            'rgb(16, 185, 129)',   // green
            'rgb(251, 146, 60)',   // orange
            'rgb(147, 51, 234)',   // purple
            'rgb(244, 63, 94)',    // red
            'rgb(245, 158, 11)',   // amber
            'rgb(139, 92, 246)',   // violet
            'rgb(236, 72, 153)'    // pink
        ];
        
        const colors = [];
        for (let i = 0; i < count; i++) {
            colors.push(baseColors[i % baseColors.length]);
        }
        return colors;
    },

    // Local storage utilities
    saveToLocalStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    },

    getFromLocalStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return null;
        }
    },

    // Session storage utilities
    saveToSessionStorage(key, data) {
        try {
            sessionStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving to sessionStorage:', error);
        }
    },

    getFromSessionStorage(key) {
        try {
            const data = sessionStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error reading from sessionStorage:', error);
            return null;
        }
    },

    // Debounce function for search inputs
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
                        timeout = setTimeout(later, wait);
        };
    },

    // Throttle function for scroll events
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Deep clone object
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    // Array utilities
    groupBy(array, key) {
        return array.reduce((result, item) => {
            (result[item[key]] = result[item[key]] || []).push(item);
            return result;
        }, {});
    },

    sortBy(array, key, order = 'asc') {
        return array.sort((a, b) => {
            if (order === 'asc') {
                return a[key] > b[key] ? 1 : -1;
            } else {
                return a[key] < b[key] ? 1 : -1;
            }
        });
    },

    // Calculate percentage
    calculatePercentage(value, total) {
        if (total === 0) return 0;
        return Math.round((value / total) * 100);
    },

    // Calculate average
    calculateAverage(array) {
        if (array.length === 0) return 0;
        const sum = array.reduce((acc, val) => acc + val, 0);
        return sum / array.length;
    },

    // Export functions
    exportToCSV(data, filename = 'export.csv') {
        if (!data || data.length === 0) {
            console.error('No data to export');
            return;
        }

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    // Escape commas and quotes in values
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // Print utilities
    printElement(elementId) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error('Element not found');
            return;
        }

        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Print</title>');
        printWindow.document.write('<link rel="stylesheet" href="https://cdn.tailwindcss.com">');
        printWindow.document.write('</head><body>');
        printWindow.document.write(element.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
    },

    // Form validation
    validateForm(formId) {
        const form = document.getElementById(formId);
        if (!form) return false;

        const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
        let isValid = true;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                input.classList.add('border-red-500');
                isValid = false;
            } else {
                input.classList.remove('border-red-500');
            }
        });

        return isValid;
    },

    // Error handling
    handleError(error, showNotification = true) {
        console.error('Error:', error);
        
        if (showNotification) {
            this.showNotification(
                error.message || 'An unexpected error occurred',
                'error'
            );
        }

        // Log to Firebase if available - with additional safety checks
        try {
            if (typeof window !== 'undefined' && 
                window.collections && 
                window.collections.errorLogs &&
                typeof firebase !== 'undefined' &&
                firebase.firestore) {
                
                window.collections.errorLogs.add({
                    error: error.message || 'Unknown error',
                    stack: error.stack || 'No stack trace',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    user: window.auth && window.auth.currentUser ? window.auth.currentUser.uid : 'anonymous',
                    userAgent: navigator.userAgent,
                    url: window.location.href
                }).catch(err => {
                    console.warn('Failed to log error to Firebase:', err);
                });
            }
        } catch (loggingError) {
            console.warn('Error logging system failed:', loggingError);
        }
    },

    // Notification system
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        const bgColors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        };
        
        const icons = {
            success: 'ri-check-line',
            error: 'ri-error-warning-line',
            warning: 'ri-alert-line',
            info: 'ri-information-line'
        };

        notification.className = `fixed top-4 right-4 ${bgColors[type]} text-white px-6 py-3 rounded-lg shadow-lg transform translate-x-full transition-transform z-50`;
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="${icons[type]}"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);
        setTimeout(() => notification.classList.remove('translate-x-full'), 100);
        
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    },

    // Loading overlay
    showLoading(message = 'Loading...') {
        const loading = document.createElement('div');
        loading.id = 'loadingOverlay';
        loading.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        loading.innerHTML = `
            <div class="bg-white rounded-lg p-6 flex items-center space-x-3">
                <i class="ri-loader-4-line animate-spin text-2xl text-blue-600"></i>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(loading);
        return loading;
    },

    hideLoading(loadingElement) {
        if (loadingElement && loadingElement.parentNode) {
            loadingElement.remove();
        } else {
            const loading = document.getElementById('loadingOverlay');
            if (loading) loading.remove();
        }
    },

    // Confirm dialog
    async confirm(message, title = 'Confirm') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-white rounded-lg p-6 max-w-sm">
                    <h3 class="text-lg font-semibold mb-3">${title}</h3>
                    <p class="text-gray-600 mb-6">${message}</p>
                    <div class="flex justify-end space-x-3">
                        <button onclick="this.closest('.fixed').remove(); window.confirmResult = false;" 
                            class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">
                            Cancel
                        </button>
                        <button onclick="this.closest('.fixed').remove(); window.confirmResult = true;" 
                            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            Confirm
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Wait for user action
            const checkResult = setInterval(() => {
                if (window.confirmResult !== undefined) {
                    clearInterval(checkResult);
                    const result = window.confirmResult;
                    delete window.confirmResult;
                    resolve(result);
                }
            }, 100);
        });
    },

    // Accessibility helpers
    announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 1000);
    },

    // Performance monitoring
    measurePerformance(label) {
        return {
            start: () => performance.mark(`${label}-start`),
            end: () => {
                performance.mark(`${label}-end`);
                performance.measure(label, `${label}-start`, `${label}-end`);
                const measure = performance.getEntriesByName(label)[0];
                console.log(`Performance: ${label} took ${measure.duration.toFixed(2)}ms`);
                return measure.duration;
            }
        };
    }
};

// Make Utils available globally
window.Utils = Utils;

// Add custom styles for consistent UI elements
const style = document.createElement('style');
style.textContent = `
    /* Custom scrollbar styles */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    
    ::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
        background: #555;
    }
    
    /* Loading animation */
    @keyframes pulse {
        0%, 100% {
            opacity: 1;
        }
        50% {
            opacity: 0.5;
        }
    }
    
    .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    
    /* Fade in animation */
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .fade-in {
        animation: fadeIn 0.3s ease-out;
    }
`;
document.head.appendChild(style);

// Initialize error boundary
window.addEventListener('error', (event) => {
    Utils.handleError(event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    Utils.handleError(new Error(event.reason));
});