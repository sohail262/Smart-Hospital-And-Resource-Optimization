// Shared utilities across pages
(function () {
    // Simple notification manager used by multiple pages
    window.authManager = {
        showNotification(message, type = 'info') {
            try {
                const existing = document.getElementById('toast-container');
                const container = existing || document.body.appendChild(Object.assign(document.createElement('div'), {
                    id: 'toast-container',
                    className: 'fixed top-4 right-4 space-y-2 z-50'
                }));
                const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800';
                const toast = document.createElement('div');
                toast.className = `${bg} text-white px-4 py-2 rounded-lg shadow flex items-center space-x-2`;
                toast.innerHTML = `<span>${message}</span>`;
                container.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
            } catch (e) {
                console.log('Notification:', type, message);
            }
        }
    };

    // Attach global signOut helper if not present
    window.signOut = async function signOut() {
        try {
            await auth.signOut();
            window.location.href = 'index.html';
        } catch (e) {
            authManager.showNotification(e.message, 'error');
        }
    };

    // Populate logged-in user name/role on pages that have those elements
    function bindUserHeader(user, profile) {
        const nameEl = document.getElementById('userName');
        const roleEl = document.getElementById('userRole');
        if (nameEl) nameEl.textContent = (profile && profile.fullName) || user.email || 'User';
        if (roleEl) roleEl.textContent = (profile && profile.role) ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'User';
    }

    // Basic realtime notifications dropdown (reads from alerts collection if present)
    function initNotifications() {
        try {
            const bell = document.querySelector('button .ri-notification-3-line')?.parentElement || null;
            if (!bell) return;

            let dropdown;
            bell.addEventListener('click', () => {
                if (!dropdown) {
                    dropdown = document.createElement('div');
                    dropdown.className = 'absolute mt-2 right-0 w-80 bg-white border rounded-xl shadow-xl z-40';
                    dropdown.innerHTML = `
                        <div class="p-3 border-b flex items-center justify-between">
                            <span class="font-medium">Notifications</span>
                            <button id="clearNotifications" class="text-xs text-blue-600">Clear</button>
                        </div>
                        <div id="notificationList" class="max-h-80 overflow-y-auto p-2 space-y-2">
                            <div class="text-sm text-gray-500 p-3">Loading...</div>
                        </div>`;
                    bell.style.position = 'relative';
                    bell.appendChild(dropdown);

                    // Load latest alerts
                    try {
                        collections.alerts
                            .orderBy('createdAt', 'desc')
                            .limit(10)
                            .onSnapshot((snap) => {
                                const list = dropdown.querySelector('#notificationList');
                                list.innerHTML = '';
                                if (snap.empty) {
                                    list.innerHTML = '<div class="text-sm text-gray-500 p-3">No notifications</div>';
                                    return;
                                }
                                snap.forEach((doc) => {
                                    const d = doc.data();
                                    const item = document.createElement('div');
                                    item.className = 'p-3 rounded-lg bg-gray-50';
                                    item.innerHTML = `
                                        <div class="text-sm font-medium">${d.title || 'Alert'}</div>
                                        <div class="text-xs text-gray-600">${d.message || ''}</div>`;
                                    list.appendChild(item);
                                });
                            });
                    } catch (_) {}

                    dropdown.querySelector('#clearNotifications').addEventListener('click', async () => {
                        try {
                            const q = await collections.alerts.limit(10).get();
                            const batch = db.batch();
                            q.forEach((doc) => batch.delete(doc.ref));
                            await batch.commit();
                            authManager.showNotification('Notifications cleared', 'success');
                        } catch (e) {
                            authManager.showNotification(e.message, 'error');
                        }
                    });
                } else {
                    dropdown.remove();
                    dropdown = null;
                }
            });
        } catch (_) {}
    }

    // On every page: bind auth state, profile, and notifications
    function initAuthBindings() {
        if (!window.auth || !window.collections) return;
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                // If page is protected, redirect to login
                const isLogin = location.pathname.endsWith('index.html') || location.pathname === '/' || location.pathname === '';
                if (!isLogin) window.location.href = 'index.html';
                return;
            }
            try {
                const doc = await collections.users.doc(user.uid).get();
                bindUserHeader(user, doc.exists ? doc.data() : null);
            } catch (_) {
                bindUserHeader(user, null);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initAuthBindings();
        initNotifications();
    });
})();

// Shared utility functions and components
// Global Chart.js configuration to disable animations
if (typeof Chart !== 'undefined') {
    Chart.defaults.animation = false;
    Chart.defaults.animations.colors = false;
    Chart.defaults.animations.x = false;
    Chart.defaults.transitions.active.animation.duration = 0;
}

// Navigation component
class NavigationManager {
    constructor() {
        this.currentPage = window.location.pathname.split('/').pop();
        this.init();
    }

    init() {
        this.renderNavigation();
        this.setActiveMenuItem();
        this.initializeUserMenu();
    }

    renderNavigation() {
        // This would be called on each page to render consistent navigation
        const navItems = [
            { href: 'dashboard.html', icon: 'dashboard-3', label: 'Dashboard' },
            { href: 'patients.html', icon: 'user-heart', label: 'Patients' },
            { href: 'resources.html', icon: 'box-3', label: 'Resources' },
            { href: 'staff.html', icon: 'nurse', label: 'Staff' },
            { href: 'emergency.html', icon: 'alarm-warning', label: 'Emergency', badge: true },
            { href: 'analytics.html', icon: 'line-chart', label: 'Analytics' },
            { href: 'ai-insights.html', icon: 'robot', label: 'AI Insights' }
        ];

        // Update navigation items with active states
        navItems.forEach(item => {
            const isActive = this.currentPage === item.href;
            // Implementation would update DOM elements
        });
    }

    setActiveMenuItem() {
        // Highlight current page in navigation
    }

    initializeUserMenu() {
        // Setup user dropdown menu
    }
}

// Date and time utilities
const DateTimeUtils = {
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

    getRelativeTime(date) {
        if (!date) return 'Unknown';
        const d = date.toDate ? date.toDate() : new Date(date);
        const now = new Date();
        const diff = Math.floor((now - d) / 1000); // seconds

        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return this.formatDate(d);
    },

    getDaysSince(date) {
        if (!date) return 0;
        const d = date.toDate ? date.toDate() : new Date(date);
        const now = new Date();
        return Math.floor((now - d) / (1000 * 60 * 60 * 24));
    }
};

// Validation utilities
const ValidationUtils = {
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    isValidPhone(phone) {
        const re = /^\d{10}$/;
        return re.test(phone.replace(/[^\d]/g, ''));
    },

    sanitizeInput(input) {
        return input.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    },

    validatePatientData(data) {
        const errors = [];
        
        if (!data.name || data.name.trim().length < 2) {
            errors.push('Patient name is required');
        }
        
        if (!data.dateOfBirth) {
            errors.push('Date of birth is required');
        }
        
        if (data.email && !this.isValidEmail(data.email)) {
            errors.push('Invalid email format');
        }
        
        if (data.phone && !this.isValidPhone(data.phone)) {
            errors.push('Invalid phone number');
        }
        
        return { isValid: errors.length === 0, errors };
    }
};

// Chart utilities
const ChartUtils = {
    getDefaultOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#ddd',
                    borderWidth: 1,
                    titleFont: { size: 14 },
                    bodyFont: { size: 13 },
                    padding: 10,
                    displayColors: true,
                    intersect: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        borderDash: [5, 5]
                    }
                }
            }
        };
    },

    generateColorPalette(count) {
        const colors = [
            'rgb(59, 130, 246)',   // blue
            'rgb(16, 185, 129)',   // green
            'rgb(251, 146, 60)',   // orange
            'rgb(147, 51, 234)',   // purple
            'rgb(244, 63, 94)',    // red
            'rgb(245, 158, 11)',   // amber
            'rgb(139, 92, 246)',   // violet
            'rgb(236, 72, 153)'    // pink
        ];
        
        return colors.slice(0, count);
    }
};

// Export utilities
const ExportUtils = {
    exportToCSV(data, filename) {
        const csv = this.convertToCSV(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    },

    convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvHeaders = headers.join(',');
        
        const csvRows = data.map(row => {
            return headers.map(header => {
                const value = row[header];
                return typeof value === 'string' && value.includes(',') 
                    ? `"${value}"` 
                    : value;
            }).join(',');
        });
        
        return [csvHeaders, ...csvRows].join('\n');
    },

    exportToPDF(elementId, filename) {
        // This would integrate with a PDF library like jsPDF
        console.log(`Exporting ${elementId} to ${filename}`);
    }
};

// Notification system
class NotificationSystem {
    static show(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        };
        
        const icons = {
            success: 'check-line',
            error: 'error-warning-line',
            warning: 'alert-line',
            info: 'information-line'
        };
        
        notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg transform translate-x-full transition-transform z-50 flex items-center space-x-2`;
        notification.innerHTML = `
            <i class="ri-${icons[type]}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => notification.classList.remove('translate-x-full'), 100);
        
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
}

// Activity logger
class ActivityLogger {
    static async log(action, details = {}) {
        try {
            const user = auth.currentUser;
            if (!user) return;
            
            await window.collections.activities.add({
                action,
                userId: user.uid,
                userEmail: user.email,
                details,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                ip: await this.getUserIP()
            });
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }

    static async getUserIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch {
            return 'unknown';
        }
    }
}

// Performance monitor
class PerformanceMonitor {
    static startTimer(label) {
        performance.mark(`${label}-start`);
    }

    static endTimer(label) {
        performance.mark(`${label}-end`);
        performance.measure(label, `${label}-start`, `${label}-end`);
        
        const measure = performance.getEntriesByName(label)[0];
        console.log(`${label}: ${measure.duration.toFixed(2)}ms`);
        
        return measure.duration;
    }

    static async trackPageLoad() {
        window.addEventListener('load', async () => {
            const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
            
            await window.collections.analytics.add({
                type: 'page_load',
                page: window.location.pathname,
                loadTime,
                userAgent: navigator.userAgent,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
    }
}

// Initialize shared components
document.addEventListener('DOMContentLoaded', () => {
    // Initialize navigation
    new NavigationManager();
    
    // Track page performance
    PerformanceMonitor.trackPageLoad();
});

// Export for use in other modules
window.SharedUtils = {
    DateTimeUtils,
    ValidationUtils,
    ChartUtils,
    ExportUtils,
    NotificationSystem,
    ActivityLogger,
    PerformanceMonitor
};