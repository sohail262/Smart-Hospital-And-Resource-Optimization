class EmergencyResponseSystem {
    constructor() {
        this.activeEmergencies = new Map();
        this.responseTeams = new Map();
        this.alertQueue = [];
        this.listeners = [];
        this.audioAlert = new Audio('C:\Users\itssp\Desktop\smh-3.1\smh-3\public\js\emergency_alert.mp3');
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.setupRealtimeListeners();
        this.initializeEmergencyProtocols();
        this.startAutoRefresh();
    }

    async checkAuth() {
        return new Promise((resolve) => {
            if (window.auth) {
                window.auth.onAuthStateChanged(user => {
                    if (user) {
                        this.currentUser = user;
                        resolve(user);
                    } else {
                        window.location.href = 'index.html';
                    }
                });
            } else {
                console.error('Firebase auth not available');
                window.location.href = 'index.html';
            }
        });
    }

    setupRealtimeListeners() {
        try {
            // Check if Firebase is ready
            if (!window.collections) {
                console.error('Firebase collections not available');
                if (window.Utils && window.Utils.handleError) {
                    window.Utils.handleError(new Error('Firebase collections not available for emergency system'));
                }
                return;
            }

            // Active emergencies listener
            if (window.collections.emergencies) {
                this.listeners.push(
                    window.collections.emergencies
                        .where('status', 'in', ['active', 'pending', 'in-progress'])
                        .onSnapshot(
                            snapshot => {
                                this.updateActiveEmergencies(snapshot);
                            },
                            error => {
                                console.error('Error in emergencies listener:', error);
                                if (window.Utils && window.Utils.handleError) {
                                    window.Utils.handleError(error);
                                }
                            }
                        )
                );
            }

            // Alerts listener
            if (window.collections.alerts) {
                this.listeners.push(
                    window.collections.alerts
                        .orderBy('timestamp', 'desc')
                        .limit(50)
                        .onSnapshot(
                            snapshot => {
                                this.updateAlertsDashboard(snapshot);
                            },
                            error => {
                                console.error('Error in alerts listener:', error);
                                if (window.Utils && window.Utils.handleError) {
                                    window.Utils.handleError(error);
                                }
                            }
                        )
                );
            }

            // Resource availability listener
            if (window.collections.resources) {
                this.listeners.push(
                    window.collections.resources
                        .where('category', 'in', ['bed', 'equipment', 'staff'])
                        .onSnapshot(
                            snapshot => {
                                this.updateResourceAvailability(snapshot);
                            },
                            error => {
                                console.error('Error in resources listener:', error);
                                if (window.Utils && window.Utils.handleError) {
                                    window.Utils.handleError(error);
                                }
                            }
                        )
                );
            }

            // Response teams listener
            if (window.collections.responseTeams) {
                this.listeners.push(
                    window.collections.responseTeams
                        .onSnapshot(
                            snapshot => {
                                this.updateResponseTeams(snapshot);
                            },
                            error => {
                                console.error('Error in response teams listener:', error);
                                if (window.Utils && window.Utils.handleError) {
                                    window.Utils.handleError(error);
                                }
                            }
                        )
                );
            }
        } catch (error) {
            console.error('Error setting up emergency response listeners:', error);
            if (window.Utils && window.Utils.handleError) {
                window.Utils.handleError(error);
            }
        }
    }

    updateActiveEmergencies(snapshot) {
        const container = document.getElementById('activeEmergencies');
        container.innerHTML = '';
        
        const emergencies = [];
        snapshot.forEach(doc => {
            const emergency = { id: doc.id, ...doc.data() };
            emergencies.push(emergency);
            this.activeEmergencies.set(doc.id, emergency);
        });

        if (emergencies.length === 0) {
            container.innerHTML = `
                <div class="col-span-2 bg-green-50 border border-green-200 rounded-lg p-8 text-center">
                    <i class="ri-shield-check-line text-4xl text-green-600 mb-3"></i>
                    <p class="text-green-800 font-medium">No Active Emergencies</p>
                    <p class="text-green-600 text-sm mt-1">All systems operating normally</p>
                </div>
            `;
            return;
        }

        emergencies.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        emergencies.forEach(emergency => {
            const priorityColors = {
                critical: 'red',
                high: 'orange',
                medium: 'yellow',
                low: 'blue'
            };
            const color = priorityColors[emergency.priority] || 'gray';

            container.innerHTML += `
                <div class="bg-${color}-50 border border-${color}-200 rounded-lg p-4 hover:shadow-md transition cursor-pointer"
                     onclick="viewEmergencyDetails('${emergency.id}')">
                    <div class="flex items-start justify-between mb-3">
                        <div class="flex items-center space-x-2">
                            <div class="w-10 h-10 bg-${color}-100 rounded-full flex items-center justify-center">
                                <i class="ri-alarm-warning-line text-${color}-600 animate-pulse"></i>
                            </div>
                            <div>
                                <h4 class="font-semibold text-gray-800">${emergency.title}</h4>
                                <p class="text-sm text-gray-600">Code: ${emergency.code || 'N/A'}</p>
                            </div>
                        </div>
                        <span class="text-xs bg-${color}-100 text-${color}-700 px-2 py-1 rounded-full">
                            ${emergency.priority?.toUpperCase()}
                        </span>
                    </div>
                    
                    <p class="text-sm text-gray-700 mb-3">${emergency.description}</p>
                    
                    <div class="flex items-center justify-between text-xs">
                        <div class="flex items-center space-x-4 text-gray-600">
                            <span><i class="ri-map-pin-line mr-1"></i>${emergency.location}</span>
                            <span><i class="ri-time-line mr-1"></i>${this.getTimeElapsed(emergency.timestamp)}</span>
                        </div>
                        <div class="flex items-center space-x-2">
                            ${emergency.assignedTeams?.map(team => `
                                <span class="bg-${color}-100 text-${color}-700 px-2 py-1 rounded text-xs">
                                    ${team}
                                </span>
                            `).join('') || ''}
                        </div>
                    </div>
                </div>
            `;
        });

        // Play alert sound for new critical emergencies
        emergencies.forEach(emergency => {
            if (emergency.priority === 'critical' && !emergency.acknowledged) {
                this.playAlertSound();
            }
        });
    }

    updateAlertsDashboard(snapshot) {
        const alerts = [];
        snapshot.forEach(doc => {
            alerts.push({ id: doc.id, ...doc.data() });
        });

        const pending = alerts.filter(a => a.status === 'pending');
        const inProgress = alerts.filter(a => a.status === 'in-progress');
        const resolved = alerts.filter(a => a.status === 'resolved' && this.isWithin24Hours(a.resolvedAt));

        // Update counts
        document.getElementById('pendingCount').textContent = pending.length;
        document.getElementById('progressCount').textContent = inProgress.length;
        document.getElementById('resolvedCount').textContent = resolved.length;

        // Update lists
        this.renderAlertList('pendingAlerts', pending);
        this.renderAlertList('progressAlerts', inProgress);
        this.renderAlertList('resolvedAlerts', resolved);
    }

    renderAlertList(containerId, alerts) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        if (alerts.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 text-sm py-4">No alerts</p>';
            return;
        }

        alerts.slice(0, 10).forEach(alert => {
            const priorityColors = {
                critical: 'red',
                high: 'orange',
                medium: 'yellow',
                low: 'gray'
            };
            const color = priorityColors[alert.priority] || 'gray';

            container.innerHTML += `
                <div class="p-3 bg-${color}-50 rounded-lg cursor-pointer hover:bg-${color}-100 transition"
                     onclick="viewAlertDetails('${alert.id}')">
                    <div class="flex items-center justify-between mb-1">
                        <span class="font-medium text-sm text-gray-800">${alert.title}</span>
                        <i class="ri-arrow-right-s-line text-gray-400"></i>
                    </div>
                    <p class="text-xs text-gray-600">${alert.department} • ${this.getTimeElapsed(alert.timestamp)}</p>
                </div>
            `;
        });
    }

    updateResourceAvailability(snapshot) {
        const resources = {
            emergencyBeds: { available: 0, total: 0 },
            ventilators: { available: 0, inUse: 0 },
            operatingRooms: { available: 0, emergencyReady: 0 },
            staff: { onDuty: 0, onCall: 0 }
        };

        snapshot.forEach(doc => {
            const resource = doc.data();
            
            if (resource.category === 'bed' && resource.department === 'Emergency') {
                resources.emergencyBeds.total++;
                if (resource.status === 'available') {
                    resources.emergencyBeds.available++;
                }
            } else if (resource.type === 'ventilator') {
                if (resource.status === 'available') {
                    resources.ventilators.available++;
                } else if (resource.status === 'in-use') {
                    resources.ventilators.inUse++;
                }
            } else if (resource.type === 'operating-room') {
                if (resource.status === 'available') {
                    resources.operatingRooms.available++;
                }
                if (resource.emergencyReady) {
                    resources.operatingRooms.emergencyReady++;
                }
            }
        });

        // Update staff counts separately
        if (window.collections && window.collections.staff) {
            window.collections.staff
                .where('department', '==', 'Emergency')
                .get()
                .then(staffSnapshot => {
                    staffSnapshot.forEach(doc => {
                        const staff = doc.data();
                        if (staff.status === 'on-duty') {
                            resources.staff.onDuty++;
                        } else if (staff.status === 'on-call') {
                            resources.staff.onCall++;
                        }
                    });

                    // Update UI
                    document.getElementById('emergencyBedsAvailable').textContent = resources.emergencyBeds.available;
                    document.getElementById('emergencyBedsTotal').textContent = resources.emergencyBeds.total;
                    document.getElementById('ventilatorsAvailable').textContent = resources.ventilators.available;
                    document.getElementById('ventilatorsInUse').textContent = resources.ventilators.inUse;
                    document.getElementById('orAvailable').textContent = resources.operatingRooms.available;
                    document.getElementById('orEmergencyReady').textContent = resources.operatingRooms.emergencyReady;
                    document.getElementById('emergencyStaffOnDuty').textContent = resources.staff.onDuty;
                    document.getElementById('emergencyStaffOnCall').textContent = resources.staff.onCall;
                })
                .catch(error => {
                    console.error('Error fetching emergency staff data:', error);
                    if (window.Utils && window.Utils.handleError) {
                        window.Utils.handleError(error);
                    }
                });
        }
    }

    updateResponseTeams(snapshot) {
        const container = document.getElementById('responseTeams');
        container.innerHTML = '';

        const teams = [];
        snapshot.forEach(doc => {
            teams.push({ id: doc.id, ...doc.data() });
        });

        if (teams.length === 0) {
            container.innerHTML = '<p class="col-span-3 text-center text-gray-500">No response teams configured</p>';
            return;
        }

        teams.forEach(team => {
            const statusColors = {
                available: 'green',
                deployed: 'red',
                preparing: 'yellow',
                'off-duty': 'gray'
            };
            const color = statusColors[team.status] || 'gray';

            container.innerHTML += `
                <div class="bg-${color}-50 border border-${color}-200 rounded-lg p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h5 class="font-semibold text-gray-800">${team.name}</h5>
                        <span class="text-xs bg-${color}-100 text-${color}-700 px-2 py-1 rounded-full">
                            ${team.status?.toUpperCase()}
                        </span>
                    </div>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Members</span>
                                                        <span class="font-medium">${team.memberCount || 0}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Lead</span>
                            <span class="font-medium">${team.teamLead || 'Unassigned'}</span>
                        </div>
                        ${team.currentAssignment ? `
                            <div class="pt-2 mt-2 border-t">
                                <p class="text-xs text-${color}-700">Assigned to: ${team.currentAssignment}</p>
                            </div>
                        ` : ''}
                    </div>
                    ${team.status === 'available' ? `
                        <button onclick="deployTeam('${team.id}')" 
                            class="w-full mt-3 bg-${color}-600 text-white py-1 rounded text-sm hover:bg-${color}-700 transition">
                            Deploy Team
                        </button>
                    ` : ''}
                </div>
            `;
        });
    }

    getTimeElapsed(timestamp) {
        if (!timestamp) return 'Unknown';
        
        const now = new Date();
        const then = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const elapsed = Math.floor((now - then) / 1000);
        
        if (elapsed < 60) return `${elapsed}s ago`;
        if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
        if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
        return `${Math.floor(elapsed / 86400)}d ago`;
    }

    isWithin24Hours(timestamp) {
        if (!timestamp) return false;
        const now = new Date();
        const then = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return (now - then) < (24 * 60 * 60 * 1000);
    }

    playAlertSound() {
        this.audioAlert.play().catch(e => console.log('Audio play failed:', e));
    }

    async initializeEmergencyProtocols() {
        // Load emergency protocols
        const protocols = [
            {
                code: 'BLUE',
                name: 'Cardiac Arrest',
                color: 'blue',
                priority: 'critical',
                requiredTeams: ['Cardiac Response Team', 'Anesthesia'],
                requiredResources: ['Crash Cart', 'Defibrillator', 'Ventilator']
            },
            {
                code: 'RED',
                name: 'Fire Emergency',
                color: 'red',
                priority: 'critical',
                requiredTeams: ['Fire Response Team', 'Security'],
                requiredResources: ['Fire Extinguishers', 'Evacuation Equipment']
            },
            {
                code: 'PINK',
                name: 'Infant Abduction',
                color: 'pink',
                priority: 'critical',
                requiredTeams: ['Security', 'Pediatric Team'],
                requiredResources: ['Lockdown System', 'Communication Devices']
            },
            {
                code: 'GRAY',
                name: 'Combative Person',
                color: 'gray',
                priority: 'high',
                requiredTeams: ['Security', 'Crisis Intervention'],
                requiredResources: ['Restraints', 'Sedatives']
            }
        ];

        this.emergencyProtocols = new Map(protocols.map(p => [p.code, p]));
    }

    async triggerEmergency(code, location, description) {
        const protocol = this.emergencyProtocols.get(code);
        if (!protocol) {
            console.error('Unknown emergency code:', code);
            return;
        }

        try {
            // Create emergency record
            const emergency = {
                code: protocol.code,
                title: protocol.name,
                description: description || `${protocol.name} activated at ${location}`,
                location: location,
                priority: protocol.priority,
                status: 'active',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                triggeredBy: this.currentUser.uid,
                acknowledged: false,
                assignedTeams: [],
                requiredResources: protocol.requiredResources,
                timeline: [{
                    action: 'Emergency triggered',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    user: this.currentUser.uid
                }]
            };

            const docRef = await window.collections.emergencies.add(emergency);
            
            // Auto-deploy required teams
            for (const teamName of protocol.requiredTeams) {
                await this.autoDeployTeam(teamName, docRef.id);
            }

            // Create high-priority alert
            await window.collections.alerts.add({
                title: `${protocol.code} - ${protocol.name}`,
                description: emergency.description,
                priority: 'critical',
                department: 'All',
                status: 'pending',
                emergencyId: docRef.id,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Send notifications
            await this.sendEmergencyNotifications(emergency, protocol);
            
            // Play alert sound
            this.playAlertSound();

            return docRef.id;
        } catch (error) {
            console.error('Error triggering emergency:', error);
            throw error;
        }
    }

    async autoDeployTeam(teamName, emergencyId) {
        try {
            // Find available team
            const teamSnapshot = await window.collections.responseTeams
                .where('name', '==', teamName)
                .where('status', '==', 'available')
                .limit(1)
                .get();

            if (!teamSnapshot.empty) {
                const teamDoc = teamSnapshot.docs[0];
                
                // Update team status
                await teamDoc.ref.update({
                    status: 'deployed',
                    currentAssignment: emergencyId,
                    deployedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Update emergency with assigned team
                await window.collections.emergencies.doc(emergencyId).update({
                    assignedTeams: firebase.firestore.FieldValue.arrayUnion(teamName)
                });

                // Log activity
                await this.logEmergencyActivity(emergencyId, `${teamName} auto-deployed`);
            }
        } catch (error) {
            console.error('Error auto-deploying team:', error);
        }
    }

    async sendEmergencyNotifications(emergency, protocol) {
        // In a real system, this would integrate with SMS, paging systems, etc.
        console.log('Sending emergency notifications for:', emergency);
        
        // Create notification records
        const notification = {
            type: 'emergency',
            priority: 'critical',
            title: `EMERGENCY: ${protocol.code} - ${protocol.name}`,
            message: emergency.description,
            recipients: ['all-staff', `${emergency.location}-staff`],
            sentAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await window.collections.notifications.add(notification);
    }

    async logEmergencyActivity(emergencyId, action, details = {}) {
        await window.collections.emergencies.doc(emergencyId).update({
            timeline: firebase.firestore.FieldValue.arrayUnion({
                action,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                user: this.currentUser.uid,
                ...details
            })
        });
    }

    startAutoRefresh() {
        // Update "last updated" timestamp
        setInterval(() => {
            document.getElementById('lastUpdate').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        }, 1000);

        // Check for critical situations every 30 seconds
        setInterval(() => {
            this.checkCriticalSituations();
        }, 30000);
    }

    async checkCriticalSituations() {
        // Check bed capacity
        const bedsSnapshot = await window.collections.beds
            .where('department', '==', 'Emergency')
            .where('status', '==', 'available')
            .get();

        if (bedsSnapshot.size < 2) {
            await this.createAutomatedAlert(
                'Critical Bed Shortage',
                'Emergency department has less than 2 available beds',
                'high'
            );
        }

        // Check staff levels
        const staffSnapshot = await window.collections.staff
            .where('department', '==', 'Emergency')
            .where('status', '==', 'on-duty')
            .get();

        const patientsSnapshot = await window.collections.patients
            .where('department', '==', 'Emergency')
            .where('status', '==', 'active')
            .get();

        const staffRatio = staffSnapshot.size / (patientsSnapshot.size || 1);
        if (staffRatio < 0.2) {
            await this.createAutomatedAlert(
                'Insufficient Emergency Staff',
                `Staff-to-patient ratio critically low: ${staffRatio.toFixed(2)}`,
                'critical'
            );
        }
    }

    async createAutomatedAlert(title, description, priority) {
        // Check if similar alert already exists
        const existingAlert = await window.collections.alerts
            .where('title', '==', title)
            .where('status', '!=', 'resolved')
            .limit(1)
            .get();

        if (existingAlert.empty) {
            await window.collections.alerts.add({
                title,
                description,
                priority,
                department: 'Emergency',
                status: 'pending',
                automated: true,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    cleanup() {
        this.listeners.forEach(unsubscribe => unsubscribe());
    }
}

// Global functions
async function triggerCodeBlue() {
    const location = prompt('Enter location for CODE BLUE:');
    if (location) {
        try {
            await emergencySystem.triggerEmergency('BLUE', location);
            showNotification('CODE BLUE activated successfully', 'success');
        } catch (error) {
            showNotification('Error activating CODE BLUE', 'error');
        }
    }
}

async function viewEmergencyDetails(emergencyId) {
    const emergency = emergencySystem.activeEmergencies.get(emergencyId);
    if (!emergency) return;

    const modal = document.getElementById('emergencyModal');
    const content = document.getElementById('emergencyModalContent');
    
    content.innerHTML = `
        <div class="space-y-4">
            <div>
                <label class="text-sm text-gray-600">Emergency Code</label>
                <p class="font-semibold text-lg">${emergency.code} - ${emergency.title}</p>
            </div>
            
            <div>
                <label class="text-sm text-gray-600">Location</label>
                <p class="font-medium">${emergency.location}</p>
            </div>
            
            <div>
                <label class="text-sm text-gray-600">Description</label>
                <p class="text-gray-800">${emergency.description}</p>
            </div>
            
            <div>
                <label class="text-sm text-gray-600">Required Resources</label>
                <div class="flex flex-wrap gap-2 mt-1">
                    ${emergency.requiredResources?.map(resource => `
                        <span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">${resource}</span>
                    `).join('') || 'None specified'}
                </div>
            </div>
            
            <div>
                <label class="text-sm text-gray-600">Assigned Teams</label>
                <div class="flex flex-wrap gap-2 mt-1">
                    ${emergency.assignedTeams?.map(team => `
                        <span class="bg-green-100 text-green-700 px-2 py-1 rounded text-sm">${team}</span>
                    `).join('') || 'No teams assigned yet'}
                </div>
            </div>
            
            <div>
                <label class="text-sm text-gray-600">Timeline</label>
                <div class="space-y-2 mt-2 max-h-40 overflow-y-auto">
                    ${emergency.timeline?.map(event => `
                        <div class="flex items-start space-x-2 text-sm">
                            <i class="ri-checkbox-circle-line text-green-600 mt-0.5"></i>
                            <div>
                                <p class="font-medium">${event.action}</p>
                                <p class="text-gray-500 text-xs">${emergencySystem.getTimeElapsed(event.timestamp)}</p>
                            </div>
                        </div>
                    `).join('') || ''}
                </div>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    window.currentEmergencyId = emergencyId;
}

function closeEmergencyModal() {
    document.getElementById('emergencyModal').classList.add('hidden');
    window.currentEmergencyId = null;
}

async function acknowledgeEmergency() {
    if (!window.currentEmergencyId) return;
    
    try {
        await window.collections.emergencies.doc(window.currentEmergencyId).update({
            acknowledged: true,
            acknowledgedBy: firebase.auth().currentUser.uid,
            acknowledgedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await emergencySystem.logEmergencyActivity(window.currentEmergencyId, 'Emergency acknowledged');
        
        showNotification('Emergency acknowledged', 'success');
        closeEmergencyModal();
    } catch (error) {
        console.error('Error acknowledging emergency:', error);
        showNotification('Error acknowledging emergency', 'error');
    }
}

async function deployTeam(teamId) {
    const emergencyId = prompt('Enter Emergency ID to assign this team:');
        if (emergencyId) {
        try {
            await window.collections.responseTeams.doc(teamId).update({
                status: 'deployed',
                currentAssignment: emergencyId,
                deployedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            await emergencySystem.logEmergencyActivity(emergencyId, 'Team manually deployed', { teamId });
            
            showNotification('Team deployed successfully', 'success');
        } catch (error) {
            console.error('Error deploying team:', error);
            showNotification('Error deploying team', 'error');
        }
    }
}

async function viewAlertDetails(alertId) {
    try {
        const alertDoc = await window.collections.alerts.doc(alertId).get();
        if (!alertDoc.exists) return;
        
        const alert = alertDoc.data();
        
        // Create a simple alert dialog
        const details = `
Alert: ${alert.title}
Department: ${alert.department}
Priority: ${alert.priority}
Status: ${alert.status}
Description: ${alert.description}
Time: ${emergencySystem.getTimeElapsed(alert.timestamp)}
        `;
        
        if (confirm(details + '\n\nMark as acknowledged?')) {
            await window.collections.alerts.doc(alertId).update({
                status: 'in-progress',
                acknowledgedBy: firebase.auth().currentUser.uid,
                acknowledgedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            showNotification('Alert acknowledged', 'success');
        }
    } catch (error) {
        console.error('Error viewing alert:', error);
    }
}

function viewAllTeams() {
    window.location.href = 'staff.html?view=teams';
}

function showNotification(message, type) {
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

// Initialize system
let emergencySystem;
document.addEventListener('DOMContentLoaded', () => {
    emergencySystem = new EmergencyResponseSystem();
});

// Cleanup
window.addEventListener('beforeunload', () => {
    if (emergencySystem) {
        emergencySystem.cleanup();
    }
});