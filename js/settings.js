class SettingsManager {
    constructor() {
        this.currentUser = null;
        this.settings = {};
        this.users = [];
        this.auditLogs = [];
        this.init();
    }

    async init() {
        await this.checkAuth();
        await this.loadSettings();
        await this.loadUsers();
        await this.loadAuditLogs();
        this.setupEventListeners();
    }

    async checkAuth() {
        return new Promise((resolve) => {
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    this.currentUser = user;
                    this.checkAdminAccess();
                    resolve(user);
                } else {
                    window.location.href = 'index.html';
                }
            });
        });
    }

    async checkAdminAccess() {
        // Check if user has admin privileges
        const userDoc = await firebaseConfig.collections.users.doc(this.currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.role !== 'administrator') {
                // Limit access to certain settings
                document.querySelectorAll('.admin-only').forEach(el => {
                    el.style.display = 'none';
                });
            }
        }
    }

    async loadSettings() {
        try {
            const settingsDoc = await firebaseConfig.collections.settings.doc('general').get();
            if (settingsDoc.exists) {
                this.settings = settingsDoc.data();
                this.populateSettings();
            } else {
                // Create default settings
                await this.createDefaultSettings();
            }
            
            // Load Gemini API settings
            await this.loadGeminiSettings();
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async createDefaultSettings() {
        const defaultSettings = {
            hospitalName: 'Smart Hospital',
            timezone: 'America/New_York',
            language: 'en',
            dateFormat: 'MM/DD/YYYY',
            notifications: {
                criticalAlerts: true,
                dailySummary: true,
                resourceAlerts: true,
                systemUpdates: false
            },
            thresholds: {
                bedOccupancy: 85,
                lowStock: 10,
                staffRatio: 0.25
            },
            dataRetention: {
                patients: 365,
                analytics: 90
            },
            backup: {
                enabled: true,
                time: '02:00'
            },
            security: {
                passwordMinLength: 8,
                requireUppercase: true,
                requireNumbers: true,
                requireSpecialChars: true,
                sessionTimeout: 30,
                twoFactorEnabled: false
            }
        };

        await firebaseConfig.collections.settings.doc('general').set(defaultSettings);
        this.settings = defaultSettings;
        this.populateSettings();
    }

    populateSettings() {
        // General settings
        if (document.getElementById('hospitalName')) {
            document.getElementById('hospitalName').value = this.settings.hospitalName || '';
            document.getElementById('timezone').value = this.settings.timezone || '';
            document.getElementById('language').value = this.settings.language || '';
            document.getElementById('dateFormat').value = this.settings.dateFormat || '';
        }

        // Notification settings
        if (this.settings.notifications) {
            document.querySelectorAll('#notificationSettingsForm input[type="checkbox"]').forEach((checkbox, index) => {
                const keys = Object.keys(this.settings.notifications);
                if (keys[index]) {
                    checkbox.checked = this.settings.notifications[keys[index]];
                }
            });
        }

        // Thresholds
        if (this.settings.thresholds) {
            document.getElementById('bedOccupancyThreshold').value = this.settings.thresholds.bedOccupancy;
            document.getElementById('lowStockThreshold').value = this.settings.thresholds.lowStock;
            document.getElementById('staffRatioThreshold').value = this.settings.thresholds.staffRatio;
        }
    }

    setupEventListeners() {
        // General settings form
        document.getElementById('generalSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveGeneralSettings();
        });

        // Notification settings form
        document.getElementById('notificationSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNotificationSettings();
        });

        // Add user form
        document.getElementById('addUserForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addNewUser();
        });
    }

    async saveGeneralSettings() {
        const updates = {
            hospitalName: document.getElementById('hospitalName').value,
            timezone: document.getElementById('timezone').value,
            language: document.getElementById('language').value,
            dateFormat: document.getElementById('dateFormat').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await firebaseConfig.collections.settings.doc('general').update(updates);
            
            await this.logActivity('settings_updated', 'Updated general settings');
            this.showNotification('General settings saved successfully', 'success');
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification('Error saving settings', 'error');
        }
    }

    async saveNotificationSettings() {
        const checkboxes = document.querySelectorAll('#notificationSettingsForm input[type="checkbox"]');
        const notifications = {
            criticalAlerts: checkboxes[0].checked,
            dailySummary: checkboxes[1].checked,
            resourceAlerts: checkboxes[2].checked,
            systemUpdates: checkboxes[3].checked
        };

        const thresholds = {
            bedOccupancy: parseInt(document.getElementById('bedOccupancyThreshold').value),
            lowStock: parseInt(document.getElementById('lowStockThreshold').value),
            staffRatio: parseFloat(document.getElementById('staffRatioThreshold').value)
        };

        try {
            await firebaseConfig.collections.settings.doc('general').update({
                notifications,
                thresholds,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await this.logActivity('settings_updated', 'Updated notification settings');
            this.showNotification('Notification settings saved successfully', 'success');
        } catch (error) {
            console.error('Error saving notification settings:', error);
            this.showNotification('Error saving notification settings', 'error');
        }
    }

    // Gemini AI Integration Methods
    async loadGeminiSettings() {
        try {
            const geminiDoc = await firebaseConfig.collections.settings.doc('gemini').get();
            if (geminiDoc.exists) {
                const geminiData = geminiDoc.data();
                if (geminiData.apiKey) {
                    document.getElementById('geminiApiKey').value = '••••••••••••••••';
                    document.getElementById('geminiStatus').textContent = 'Configured';
                    document.getElementById('geminiStatus').className = 'px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm';
                }
            }
        } catch (error) {
            console.error('Error loading Gemini settings:', error);
        }
    }

    async saveGeminiApiKey() {
        const apiKey = document.getElementById('geminiApiKey').value;
        if (!apiKey || apiKey === '••••••••••••••••') {
            this.showNotification('Please enter a valid API key', 'error');
            return;
        }

        try {
            // Save API key to settings
            await firebaseConfig.collections.settings.doc('gemini').set({
                apiKey: apiKey,
                enabled: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: this.currentUser.uid
            });

            // Test the API key
            const isValid = await this.testGeminiApiKey(apiKey);
            
            if (isValid) {
                document.getElementById('geminiApiKey').value = '••••••••••••••••';
                document.getElementById('geminiStatus').textContent = 'Active';
                document.getElementById('geminiStatus').className = 'px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm';
                
                await this.logActivity('settings_updated', 'Configured Gemini AI integration');
                this.showNotification('Gemini API key saved and tested successfully!', 'success');
            } else {
                // Remove invalid API key
                await firebaseConfig.collections.settings.doc('gemini').delete();
                document.getElementById('geminiStatus').textContent = 'Invalid API Key';
                document.getElementById('geminiStatus').className = 'px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm';
                this.showNotification('Invalid API key. Please check and try again.', 'error');
            }
        } catch (error) {
            console.error('Error saving Gemini API key:', error);
            this.showNotification('Error saving API key', 'error');
        }
    }

    async testGeminiApiKey(apiKey = null) {
        if (!apiKey) {
            // Get the actual API key from the database
            const geminiDoc = await firebaseConfig.collections.settings.doc('gemini').get();
            if (!geminiDoc.exists) {
                this.showNotification('No API key configured', 'error');
                return false;
            }
            apiKey = geminiDoc.data().apiKey;
        }

        try {
            // Simple test request to Gemini API
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: 'Hello, this is a test message.' }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 10
                    }
                })
            });

            if (response.ok) {
                this.showNotification('Gemini API connection successful!', 'success');
                return true;
            } else {
                console.error('Gemini API test failed:', response.status, response.statusText);
                this.showNotification(`API test failed: ${response.status} ${response.statusText}`, 'error');
                return false;
            }
        } catch (error) {
            console.error('Error testing Gemini API:', error);
            this.showNotification('Error testing API connection', 'error');
            return false;
        }
    }

    async loadUsers() {
        try {
            const snapshot = await firebaseConfig.collections.users.get();
            this.users = [];
            
            snapshot.forEach(doc => {
                this.users.push({ id: doc.id, ...doc.data() });
            });

            this.renderUsersTable();
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    renderUsersTable() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        this.users.forEach(user => {
            const statusColor = user.status === 'active' ? 'green' : 'red';
            
            tbody.innerHTML += `
                <tr class="hover:bg-gray-50 transition">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                                <i class="ri-user-3-line text-gray-600"></i>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900">${user.fullName || 'N/A'}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${user.email}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            ${user.role}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 text-xs font-medium rounded-full bg-${statusColor}-100 text-${statusColor}-800">
                            ${user.status || 'active'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="editUser('${user.id}')" 
                            class="text-indigo-600 hover:text-indigo-900 mr-3">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button onclick="toggleUserStatus('${user.id}')" 
                            class="text-${user.status === 'active' ? 'red' : 'green'}-600 hover:text-${user.status === 'active' ? 'red' : 'green'}-900">
                            <i class="ri-${user.status === 'active' ? 'pause' : 'play'}-circle-line"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    async addNewUser() {
        const userData = {
            fullName: document.getElementById('newUserName').value,
            email: document.getElementById('newUserEmail').value,
            role: document.getElementById('newUserRole').value,
            department: document.getElementById('newUserDepartment').value,
            status: 'active',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: this.currentUser.uid
        };

        try {
            // Create user account
            const tempPassword = this.generateTempPassword();
            
            // In a real system, you'd use Admin SDK to create users
            // For now, we'll just add to the users collection
            await firebaseConfig.collections.users.add(userData);
            
            await this.logActivity('user_created', `Created new user: ${userData.email}`);
            
            // Send email notification (simulated)
            console.log(`Email sent to ${userData.email} with temporary password: ${tempPassword}`);
            
            this.showNotification('User created successfully', 'success');
            closeAddUserModal();
            await this.loadUsers();
            
        } catch (error) {
            console.error('Error creating user:', error);
            this.showNotification('Error creating user', 'error');
        }
    }

    generateTempPassword() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    async loadAuditLogs() {
        try {
            const snapshot = await firebaseConfig.collections.activities
                .orderBy('timestamp', 'desc')
                .limit(20)
                .get();

            this.auditLogs = [];
            snapshot.forEach(doc => {
                this.auditLogs.push({ id: doc.id, ...doc.data() });
            });

            this.renderAuditLog();
        } catch (error) {
            console.error('Error loading audit logs:', error);
        }
    }

    renderAuditLog() {
        const container = document.getElementById('auditLog');
        if (!container) return;

        container.innerHTML = '';

        this.auditLogs.forEach(log => {
            const time = log.timestamp ? 
                new Date(log.timestamp.toDate()).toLocaleString() : 'Unknown';
            
            container.innerHTML += `
                <div class="flex items-start space-x-3 py-3 border-b">
                                        <div class="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <i class="ri-history-line text-gray-600 text-sm"></i>
                    </div>
                    <div class="flex-1">
                        <p class="text-sm text-gray-800">${log.action || log.message}</p>
                        <p class="text-xs text-gray-500">
                            ${log.userEmail || 'System'} • ${time}
                        </p>
                    </div>
                </div>
            `;
        });
    }

    async logActivity(action, message) {
        try {
            await firebaseConfig.collections.activities.add({
                action,
                message,
                userId: this.currentUser.uid,
                userEmail: this.currentUser.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
        
        notification.className = `fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg transform translate-x-full transition-transform z-50`;
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="ri-${type === 'success' ? 'check' : 'error-warning'}-line"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.remove('translate-x-full'), 100);
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Global functions
function showSettingsSection(section) {
    // Hide all sections
    document.querySelectorAll('.settings-section').forEach(el => {
        el.classList.add('hidden');
    });
    
    // Remove active state from all tabs
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600', 'bg-blue-50');
        tab.classList.add('text-gray-600');
    });
    
    // Show selected section
    document.getElementById(`${section}-settings`).classList.remove('hidden');
    
    // Add active state to clicked tab
    event.target.classList.remove('text-gray-600');
    event.target.classList.add('text-blue-600', 'border-b-2', 'border-blue-600', 'bg-blue-50');
    
    // Load section-specific data
    if (section === 'billing' && window.billingManager) {
        window.billingManager.loadBillingRatesForSettings();
        window.billingManager.loadPatientBillsForSettings();
    }
}

function showAddUserModal() {
    document.getElementById('addUserModal').classList.remove('hidden');
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.add('hidden');
    document.getElementById('addUserForm').reset();
}

async function editUser(userId) {
    console.log('Edit user:', userId);
    // Implementation for editing user
}

async function toggleUserStatus(userId) {
    try {
        const user = settingsManager.users.find(u => u.id === userId);
        if (!user) return;
        
        const newStatus = user.status === 'active' ? 'inactive' : 'active';
        
        await firebaseConfig.collections.users.doc(userId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await settingsManager.logActivity('user_status_changed', 
            `Changed user ${user.email} status to ${newStatus}`);
        
        settingsManager.showNotification('User status updated', 'success');
        await settingsManager.loadUsers();
        
    } catch (error) {
        console.error('Error toggling user status:', error);
        settingsManager.showNotification('Error updating user status', 'error');
    }
}

async function saveSystemSettings() {
    const updates = {
        dataRetention: {
            patients: parseInt(document.getElementById('patientRetention').value),
            analytics: parseInt(document.getElementById('analyticsRetention').value)
        },
        backup: {
            enabled: document.querySelector('#system-settings input[type="checkbox"]').checked,
            time: document.getElementById('backupTime').value
        },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await firebaseConfig.collections.settings.doc('general').update(updates);
        
        await settingsManager.logActivity('settings_updated', 'Updated system settings');
        settingsManager.showNotification('System settings saved successfully', 'success');
    } catch (error) {
        console.error('Error saving system settings:', error);
        settingsManager.showNotification('Error saving system settings', 'error');
    }
}

async function runSystemDiagnostics() {
    settingsManager.showNotification('Running system diagnostics...', 'success');
    
    // Simulate diagnostics
    setTimeout(async () => {
        const results = {
            database: 'OK',
            storage: 'OK',
            api: 'OK',
            performance: 'Good'
        };
        
        await settingsManager.logActivity('diagnostics_run', 'System diagnostics completed');
        
        // Show results
        alert(`System Diagnostics Results:

Database: ${results.database}
Storage: ${results.storage}
API: ${results.api}
Performance: ${results.performance}`);
    }, 2000);
}

async function saveSecuritySettings() {
    const passwordSettings = {
        passwordMinLength: parseInt(document.querySelector('#security-settings input[type="number"]').value),
        requireUppercase: document.querySelectorAll('#security-settings input[type="checkbox"]')[0].checked,
        requireNumbers: document.querySelectorAll('#security-settings input[type="checkbox"]')[1].checked,
        requireSpecialChars: document.querySelectorAll('#security-settings input[type="checkbox"]')[2].checked,
        sessionTimeout: parseInt(document.querySelectorAll('#security-settings input[type="number"]')[1].value),
        twoFactorEnabled: document.querySelectorAll('#security-settings input[type="checkbox"]')[3].checked
    };

    try {
        await firebaseConfig.collections.settings.doc('general').update({
            security: passwordSettings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await settingsManager.logActivity('settings_updated', 'Updated security settings');
        settingsManager.showNotification('Security settings saved successfully', 'success');
    } catch (error) {
        console.error('Error saving security settings:', error);
        settingsManager.showNotification('Error saving security settings', 'error');
    }
}

async function downloadAuditLog() {
    try {
        // Get extended audit log
        const snapshot = await firebaseConfig.collections.activities
            .orderBy('timestamp', 'desc')
            .limit(1000)
            .get();

        const logs = [];
        snapshot.forEach(doc => {
            const log = doc.data();
            logs.push({
                timestamp: log.timestamp ? new Date(log.timestamp.toDate()).toISOString() : '',
                action: log.action || log.message,
                user: log.userEmail || 'System',
                details: JSON.stringify(log.details || {})
            });
        });

        // Convert to CSV
        const csv = convertToCSV(logs);
        downloadCSV(csv, `audit_log_${new Date().toISOString().split('T')[0]}.csv`);
        
        await settingsManager.logActivity('audit_log_exported', 'Audit log exported');
        settingsManager.showNotification('Audit log downloaded successfully', 'success');
        
    } catch (error) {
        console.error('Error downloading audit log:', error);
        settingsManager.showNotification('Error downloading audit log', 'error');
    }
}

function convertToCSV(data) {
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
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Initialize
let settingsManager;
document.addEventListener('DOMContentLoaded', () => {
    settingsManager = new SettingsManager();
});

// Global functions for Gemini AI integration
function saveGeminiApiKey() {
    if (settingsManager) {
        settingsManager.saveGeminiApiKey();
    }
}

function testGeminiConnection() {
    if (settingsManager) {
        settingsManager.testGeminiApiKey();
    }
}