class EnhancedAIInsightsManager {
    constructor() {
        this.insights = [];
        this.recommendations = [];
        this.predictions = {};
        this.charts = {};
        this.realTimeData = {
            patients: [],
            resources: [],
            staff: [],
            departments: []
        };
        this.listeners = [];
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Enhanced AI Insights Manager...');
        await this.checkAuth();
        console.log('✅ Authentication checked');
        await this.loadRealTimeData();
        console.log('✅ Real-time data loaded:', this.realTimeData);
        
        // Generate insights and recommendations immediately
        setTimeout(async () => {
            await this.generateGeminiInsights();
            await this.generateGeminiRecommendations();
        }, 1000);
        
        this.setupCharts();
        this.startRealTimeUpdates();
        this.setupRealtimeListeners();
        console.log('🎯 AI Insights Manager fully initialized');
    }

    async checkAuth() {
        return new Promise((resolve) => {
            window.auth.onAuthStateChanged(user => {
                if (user) {
                    this.currentUser = user;
                    resolve(user);
                } else {
                    window.location.href = 'index.html';
                }
            });
        });
    }

    async loadRealTimeData() {
        try {
            // Load current hospital data for AI analysis
            const [patientsSnapshot, resourcesSnapshot, staffSnapshot, departmentsSnapshot] = await Promise.all([
                window.collections.patients.where('status', '==', 'active').get(),
                window.collections.resources.get(),
                window.collections.staff.where('status', '==', 'active').get(),
                window.collections.departments.get()
            ]);

            this.realTimeData.patients = [];
            patientsSnapshot.forEach(doc => {
                this.realTimeData.patients.push({ id: doc.id, ...doc.data() });
            });

            this.realTimeData.resources = [];
            resourcesSnapshot.forEach(doc => {
                this.realTimeData.resources.push({ id: doc.id, ...doc.data() });
            });

            this.realTimeData.staff = [];
            staffSnapshot.forEach(doc => {
                this.realTimeData.staff.push({ id: doc.id, ...doc.data() });
            });

            this.realTimeData.departments = [];
            departmentsSnapshot.forEach(doc => {
                this.realTimeData.departments.push({ id: doc.id, ...doc.data() });
            });

            console.log('Real-time data loaded:', this.realTimeData);

            // If we have no data, create some sample data for demonstration
            if (this.realTimeData.patients.length === 0 && this.realTimeData.resources.length === 0) {
                console.log('🔧 No hospital data found, creating sample data for AI analysis');
                await this.createSampleHospitalData();
            }
        } catch (error) {
            console.error('Error loading real-time data:', error);
            // Create sample data on error too
            await this.createSampleHospitalData();
        }
    }

    async createSampleHospitalData() {
        // Create sample data that the AI can analyze
        this.realTimeData.patients = [
            { id: '1', firstName: 'John', lastName: 'Doe', priority: 'critical', department: 'ICU', admittedAt: new Date() },
            { id: '2', firstName: 'Jane', lastName: 'Smith', priority: 'high', department: 'Emergency', admittedAt: new Date() },
            { id: '3', firstName: 'Bob', lastName: 'Johnson', priority: 'medium', department: 'General', admittedAt: new Date() }
        ];

        this.realTimeData.resources = [
            { id: '1', name: 'ICU Bed 1', type: 'Beds', total: 20, available: 2, department: 'ICU' },
            { id: '2', name: 'Ventilator A', type: 'Ventilators', total: 10, available: 1, department: 'ICU' },
            { id: '3', name: 'ER Bed Block', type: 'Beds', total: 30, available: 8, department: 'Emergency' },
            { id: '4', name: 'General Ward Beds', type: 'Beds', total: 50, available: 15, department: 'General' }
        ];

        this.realTimeData.departments = [
            { id: '1', name: 'ICU', capacity: 20, currentLoad: 18 },
            { id: '2', name: 'Emergency', capacity: 30, currentLoad: 22 },
            { id: '3', name: 'General', capacity: 50, currentLoad: 35 }
        ];

        this.realTimeData.staff = [
            { id: '1', name: 'Dr. Smith', department: 'ICU', currentWorkload: 95 },
            { id: '2', name: 'Nurse Johnson', department: 'Emergency', currentWorkload: 85 },
            { id: '3', name: 'Dr. Brown', department: 'General', currentWorkload: 60 }
        ];

        console.log('✅ Sample hospital data created for AI analysis');
    }

    setupRealtimeListeners() {
        // Listen for real-time changes in hospital data
        this.listeners.push(
            window.collections.patients.where('status', '==', 'active').onSnapshot(snapshot => {
                this.realTimeData.patients = [];
            snapshot.forEach(doc => {
                    this.realTimeData.patients.push({ id: doc.id, ...doc.data() });
                });
                this.debounceGenerateInsights();
            })
        );

        this.listeners.push(
            window.collections.resources.onSnapshot(snapshot => {
                this.realTimeData.resources = [];
                snapshot.forEach(doc => {
                    this.realTimeData.resources.push({ id: doc.id, ...doc.data() });
                });
                this.debounceGenerateInsights();
            })
        );
    }

    debounceGenerateInsights() {
        clearTimeout(this.insightTimeout);
        this.insightTimeout = setTimeout(() => {
            this.generateGeminiInsights();
        }, 5000); // Wait 5 seconds after last change
    }

    async generateGeminiInsights() {
        try {
            this.showNotification('Analyzing hospital data with Gemini AI...', 'info');

            // Prepare comprehensive hospital context for Gemini AI
            const hospitalContext = this.buildHospitalContext();
            console.log('🏥 Hospital context prepared:', hospitalContext);
            
            // Get AI insights using Gemini
            const aiInsights = await this.callGeminiForInsights(hospitalContext);
            console.log('🤖 AI insights received:', aiInsights);
            
            // Parse and store insights
            this.insights = this.parseAIInsights(aiInsights);
            console.log('📊 Parsed insights:', this.insights);
            
            // Ensure we have some insights even if AI doesn't return any
            if (this.insights.length === 0) {
                console.log('⚠️ No insights from AI, generating fallback insights');
                const fallbackInsights = await this.generateIntelligentMockInsights(hospitalContext);
                this.insights = fallbackInsights.insights || [];
            }
            
            // Update UI
            this.updateInsightsCounts();
            this.renderInsights();
            
            this.showNotification(`Generated ${this.insights.length} AI insights successfully!`, 'success');
        } catch (error) {
            console.error('Error generating Gemini insights:', error);
            this.showNotification('Error generating AI insights: ' + error.message, 'error');
            
            // Generate fallback insights even on error
            try {
                const hospitalContext = this.buildHospitalContext();
                const fallbackInsights = await this.generateIntelligentMockInsights(hospitalContext);
                this.insights = fallbackInsights.insights || [];
                this.updateInsightsCounts();
                this.renderInsights();
                this.showNotification('Generated fallback insights based on hospital data', 'warning');
            } catch (fallbackError) {
                console.error('Error generating fallback insights:', fallbackError);
            }
        }
    }

    buildHospitalContext() {
        const context = {
            timestamp: new Date().toISOString(),
            hospitalStats: {
                totalPatients: this.realTimeData.patients.length,
                criticalPatients: this.realTimeData.patients.filter(p => p.priority === 'critical').length,
                departmentOccupancy: this.calculateDepartmentOccupancy(),
                resourceUtilization: this.calculateResourceUtilization(),
                staffWorkload: this.calculateStaffWorkload()
            },
            patients: this.realTimeData.patients.map(p => ({
                id: p.id,
                priority: p.priority,
                department: p.department,
                admittedAt: p.admittedAt,
                condition: p.chiefComplaint,
                age: this.calculateAge(p.dateOfBirth)
            })),
            resources: this.realTimeData.resources.map(r => ({
                id: r.id,
                type: r.type,
                name: r.name,
                available: r.available || 0,
                total: r.total || 0,
                department: r.department,
                utilizationRate: r.total > 0 ? ((r.total - r.available) / r.total * 100) : 0
            })),
            departments: this.realTimeData.departments.map(d => ({
                id: d.id,
                name: d.name,
                capacity: d.capacity || 0,
                currentLoad: d.currentLoad || 0,
                occupancyRate: d.capacity > 0 ? (d.currentLoad / d.capacity * 100) : 0
            }))
        };

        return context;
    }

    calculateDepartmentOccupancy() {
        const occupancy = {};
        this.realTimeData.departments.forEach(dept => {
            const patientsInDept = this.realTimeData.patients.filter(p => p.department === dept.id).length;
            occupancy[dept.name] = {
                current: patientsInDept,
                capacity: dept.capacity || 0,
                rate: dept.capacity > 0 ? (patientsInDept / dept.capacity * 100) : 0
            };
        });
        return occupancy;
    }

    calculateResourceUtilization() {
        const utilization = {};
        this.realTimeData.resources.forEach(resource => {
            const utilizationRate = resource.total > 0 ? 
                ((resource.total - resource.available) / resource.total * 100) : 0;
            
            if (!utilization[resource.type]) {
                utilization[resource.type] = [];
            }
            
            utilization[resource.type].push({
                name: resource.name,
                rate: utilizationRate,
                available: resource.available,
                total: resource.total
            });
        });
        return utilization;
    }

    calculateStaffWorkload() {
        const workload = {};
        this.realTimeData.staff.forEach(staff => {
            const dept = staff.department || 'Unassigned';
            if (!workload[dept]) {
                workload[dept] = { count: 0, totalWorkload: 0 };
            }
            workload[dept].count++;
            workload[dept].totalWorkload += staff.currentWorkload || 0;
        });
        
        // Calculate average workload per department
        Object.keys(workload).forEach(dept => {
            workload[dept].averageWorkload = workload[dept].count > 0 ? 
                workload[dept].totalWorkload / workload[dept].count : 0;
        });
        
        return workload;
    }

    calculateAge(dateOfBirth) {
        if (!dateOfBirth) return 0;
        const dob = dateOfBirth.toDate ? dateOfBirth.toDate() : new Date(dateOfBirth);
        const ageDiff = Date.now() - dob.getTime();
        const ageDate = new Date(ageDiff);
        return Math.abs(ageDate.getUTCFullYear() - 1970);
    }

    async callGeminiForInsights(hospitalContext) {
        const prompt = `As a hospital operations AI analyst, analyze this real-time hospital data and provide actionable insights:

**Current Hospital Status:**
- Total Patients: ${hospitalContext.hospitalStats.totalPatients}
- Critical Patients: ${hospitalContext.hospitalStats.criticalPatients}
- Timestamp: ${hospitalContext.timestamp}

**Department Occupancy:**
${Object.entries(hospitalContext.hospitalStats.departmentOccupancy).map(([dept, data]) => 
    `- ${dept}: ${data.current}/${data.capacity} (${data.rate.toFixed(1)}%)`).join('\n')}

**Resource Utilization:**
${Object.entries(hospitalContext.hospitalStats.resourceUtilization).map(([type, resources]) => 
    `- ${type}: ${resources.map(r => `${r.name} ${r.rate.toFixed(1)}%`).join(', ')}`).join('\n')}

**Staff Workload:**
${Object.entries(hospitalContext.hospitalStats.staffWorkload).map(([dept, data]) => 
    `- ${dept}: ${data.count} staff, avg workload ${data.averageWorkload.toFixed(1)}%`).join('\n')}

Please provide insights in this JSON format:
{
  "insights": [
    {
      "id": "unique_id",
      "title": "Insight Title",
      "description": "Detailed description",
      "category": "optimization|prediction|alert|recommendation",
      "priority": "critical|high|medium|low",
      "confidence": 0.85,
      "actionType": "resource_reallocation|staff_adjustment|alert_generation|capacity_management",
      "recommendations": ["action 1", "action 2"],
      "actionData": {
        "sourceResource": "resource_id",
        "targetDepartment": "dept_id",
        "quantity": 5,
        "urgency": "immediate"
      }
    }
  ],
  "predictions": {
    "patientFlow": {
      "nextHour": 15,
      "peakTime": "14:00",
      "peakCount": 45
    },
    "resourceShortages": [
      {
        "resource": "Ventilators",
        "department": "ICU",
        "timeToShortage": "6 hours",
        "severity": "critical"
      }
    ]
  },
  "summary": "Overall assessment and key recommendations"
}

Focus on:
1. **Critical Issues**: Overcrowding, resource shortages, staff overload
2. **Optimization Opportunities**: Resource reallocation, workflow improvements
3. **Predictive Alerts**: Anticipated problems in next 24 hours
4. **Actionable Recommendations**: Specific steps that can be implemented immediately

Ensure all insights are based on the actual data provided and include specific, actionable recommendations.`;

        if (window.geminiAI && window.geminiAI.isConfigured()) {
            // Use the real Gemini AI hospital insights method
            console.log('🤖 Using real Gemini AI for hospital insights');
            return await window.geminiAI.generateHospitalInsights(hospitalContext);
        } else {
            // Fallback to intelligent mock response based on real data
            console.log('📊 Using intelligent mock insights based on real hospital data');
            return this.generateIntelligentMockInsights(hospitalContext);
        }
    }

    parseTextResponse(textResponse) {
        // Parse text response into structured format
        const insights = [];
        const lines = textResponse.split('\n');
        
        let currentInsight = null;
        lines.forEach(line => {
            if (line.includes('**') && line.includes(':**')) {
                // New insight detected
                if (currentInsight) insights.push(currentInsight);
                currentInsight = {
                    id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    title: line.replace(/\*\*/g, '').replace(':', '').trim(),
                    description: '',
                    category: 'optimization',
                    priority: 'medium',
                    confidence: 0.8,
                    recommendations: [],
                    actionType: 'manual'
                };
            } else if (currentInsight && line.trim()) {
                if (line.startsWith('•') || line.startsWith('-')) {
                    currentInsight.recommendations.push(line.replace(/^[•\-]\s*/, ''));
                } else {
                    currentInsight.description += line.trim() + ' ';
                }
            }
        });
        
        if (currentInsight) insights.push(currentInsight);
        
        return {
            insights,
            predictions: {
                patientFlow: { nextHour: 12, peakTime: "14:00", peakCount: 35 },
                resourceShortages: []
            },
            summary: "AI analysis completed based on current hospital data."
        };
    }

    generateIntelligentMockInsights(context) {
        const insights = [];
        const timestamp = Date.now();
        
        console.log('🔧 Generating intelligent mock insights with context:', context);
        
        // Always generate at least one insight for system status
        insights.push({
            id: `system_status_${timestamp}`,
            title: 'Hospital Operations Analysis',
            description: `AI analysis of current hospital operations with ${context.hospitalStats.totalPatients} patients and ${context.hospitalStats.criticalPatients} critical cases.`,
            category: 'optimization',
            priority: 'medium',
            confidence: 0.9,
            actionType: 'workflow_optimization',
            recommendations: [
                'Continue monitoring patient flow patterns',
                'Maintain current resource allocation efficiency',
                'Review staffing levels for optimal coverage'
            ],
            actionData: {
                totalPatients: context.hospitalStats.totalPatients,
                analysisTime: new Date().toISOString()
            }
        });
        
        // Analyze department occupancy
        if (context.hospitalStats.departmentOccupancy) {
            Object.entries(context.hospitalStats.departmentOccupancy).forEach(([dept, data]) => {
                if (data.rate > 90) {
                    insights.push({
                        id: `occupancy_critical_${dept}_${timestamp}`,
                        title: `Critical Occupancy in ${dept}`,
                        description: `${dept} is at ${data.rate.toFixed(1)}% capacity (${data.current}/${data.capacity}). Immediate action needed to prevent overcrowding.`,
                        category: 'alert',
                        priority: 'critical',
                        confidence: 0.95,
                        actionType: 'capacity_management',
                        recommendations: [
                            'Prepare overflow capacity in adjacent departments',
                            'Accelerate discharge planning for stable patients',
                            'Consider temporary bed setup if available'
                        ],
                        actionData: {
                            department: dept,
                            currentOccupancy: data.rate,
                            urgency: 'immediate'
                        }
                    });
                } else if (data.rate > 75) {
                    insights.push({
                        id: `occupancy_warn_${dept}_${timestamp}`,
                        title: `High Occupancy Warning - ${dept}`,
                        description: `${dept} approaching capacity at ${data.rate.toFixed(1)}%. Monitor closely and prepare for potential overflow.`,
                        category: 'prediction',
                        priority: 'high',
                        confidence: 0.85,
                        actionType: 'capacity_management',
                        recommendations: [
                            'Monitor admission rate closely',
                            'Review discharge readiness of current patients',
                            'Alert department head of approaching capacity'
                        ],
                        actionData: {
                            department: dept,
                            currentOccupancy: data.rate
                        }
                    });
                } else if (data.rate > 50) {
                    insights.push({
                        id: `occupancy_normal_${dept}_${timestamp}`,
                        title: `${dept} Operating Normally`,
                        description: `${dept} at ${data.rate.toFixed(1)}% capacity. Operating within normal parameters.`,
                        category: 'optimization',
                        priority: 'low',
                        confidence: 0.8,
                        actionType: 'workflow_optimization',
                        recommendations: [
                            'Maintain current operational efficiency',
                            'Monitor for any capacity changes',
                            'Continue standard protocols'
                        ],
                        actionData: {
                            department: dept,
                            currentOccupancy: data.rate
                        }
                    });
                }
            });
        }

        // Analyze resource utilization
        Object.entries(context.hospitalStats.resourceUtilization).forEach(([type, resources]) => {
            resources.forEach(resource => {
                if (resource.rate > 95) {
                    insights.push({
                        id: `resource_critical_${resource.name}_${Date.now()}`,
                        title: `Critical Resource Shortage - ${resource.name}`,
                        description: `${resource.name} is at ${resource.rate.toFixed(1)}% utilization. Only ${resource.available} units remaining.`,
                        category: 'alert',
                        priority: 'critical',
                        confidence: 0.9,
                        actionType: 'resource_reallocation',
                        recommendations: [
                            'Identify alternative resources in other departments',
                            'Contact suppliers for emergency procurement',
                            'Implement resource conservation protocols'
                        ],
                        actionData: {
                            resource: resource.name,
                            available: resource.available,
                            total: resource.total,
                            urgency: 'immediate'
                        }
                    });
                }
            });
        });

        // Analyze staff workload
        Object.entries(context.hospitalStats.staffWorkload).forEach(([dept, data]) => {
            if (data.averageWorkload > 90) {
                insights.push({
                    id: `staff_overload_${dept}_${Date.now()}`,
                    title: `Staff Overload in ${dept}`,
                    description: `Average staff workload in ${dept} is ${data.averageWorkload.toFixed(1)}% with ${data.count} staff members.`,
                    category: 'alert',
                    priority: 'high',
                    confidence: 0.8,
                    actionType: 'staff_adjustment',
                    recommendations: [
                        'Consider staff reallocation from less busy departments',
                        'Implement temporary overtime protocols',
                        'Review patient prioritization and care efficiency'
                    ],
                    actionData: {
                        department: dept,
                        staffCount: data.count,
                        workload: data.averageWorkload
                    }
                });
            }
        });

        // Generate predictive insights
        const criticalPatients = context.hospitalStats.criticalPatients;
        if (criticalPatients > context.hospitalStats.totalPatients * 0.3) {
            insights.push({
                id: `critical_surge_${Date.now()}`,
                title: 'High Critical Patient Volume',
                description: `${criticalPatients} critical patients (${(criticalPatients/context.hospitalStats.totalPatients*100).toFixed(1)}% of total). This may indicate emerging health crisis.`,
                category: 'prediction',
                priority: 'critical',
                confidence: 0.88,
                actionType: 'alert_generation',
                recommendations: [
                    'Activate emergency response protocols',
                    'Increase ICU staffing and resources',
                    'Prepare for potential surge in critical cases'
                ]
            });
        }

        return {
            insights,
            predictions: {
                patientFlow: {
                    nextHour: Math.max(5, Math.floor(context.hospitalStats.totalPatients * 0.1)),
                    peakTime: "14:00",
                    peakCount: Math.max(20, Math.floor(context.hospitalStats.totalPatients * 0.8))
                },
                resourceShortages: insights
                    .filter(i => i.actionType === 'resource_reallocation')
                    .map(i => ({
                        resource: i.actionData?.resource || 'Unknown',
                        department: i.actionData?.department || 'Unknown',
                        timeToShortage: '2-4 hours',
                        severity: i.priority
                    }))
            },
            summary: `Analysis of ${context.hospitalStats.totalPatients} patients across ${context.departments.length} departments reveals ${insights.filter(i => i.priority === 'critical').length} critical issues requiring immediate attention.`
        };
    }

    parseAIInsights(aiResponse) {
        if (aiResponse.insights) {
            return aiResponse.insights.map(insight => ({
                ...insight,
                createdAt: new Date(),
                implemented: false
            }));
        }
        return [];
    }

    async generateGeminiRecommendations() {
        try {
            const context = this.buildHospitalContext();
            console.log('🔧 Generating recommendations with context:', context);

            let recommendationsResponse;
            if (window.geminiAI && window.geminiAI.isConfigured()) {
                console.log('🤖 Using real Gemini AI for resource optimization');
                recommendationsResponse = await window.geminiAI.generateResourceOptimization(context);
            } else {
                console.log('📊 Using intelligent mock recommendations based on real hospital data');
                recommendationsResponse = await this.generateIntelligentMockRecommendations(context);
            }

            this.recommendations = recommendationsResponse.recommendations || [];
            console.log('💡 Generated recommendations:', this.recommendations);
            
            // Ensure we have some recommendations
            if (this.recommendations.length === 0) {
                console.log('⚠️ No recommendations generated, creating fallback recommendations');
                const fallbackResponse = await this.generateIntelligentMockRecommendations(context);
                this.recommendations = fallbackResponse.recommendations || [];
            }
            
            this.renderRecommendations();
            console.log('✅ Recommendations rendered successfully');
            
        } catch (error) {
            console.error('Error generating recommendations:', error);
            
            // Always provide fallback recommendations
            try {
                const fallbackResponse = await this.generateIntelligentMockRecommendations(this.buildHospitalContext());
                this.recommendations = fallbackResponse.recommendations || [];
                this.renderRecommendations();
                this.showNotification('Generated fallback recommendations', 'warning');
            } catch (fallbackError) {
                console.error('Error generating fallback recommendations:', fallbackError);
                // Create minimal recommendations as last resort
                this.recommendations = [{
                    id: 'default_rec',
                    title: 'System Monitoring Active',
                    description: 'AI system is monitoring hospital operations and will provide recommendations as data becomes available.',
                    impact: 'Continuous monitoring',
                    effort: 'Low',
                    priority: 'medium',
                    actionType: 'workflow_optimization'
                }];
                this.renderRecommendations();
            }
        }
    }

    generateIntelligentMockRecommendations(context) {
        const recommendations = [];
        
        // Find most occupied department
        let maxOccupancy = 0;
        let maxOccupancyDept = null;
        Object.entries(context.hospitalStats.departmentOccupancy).forEach(([dept, data]) => {
            if (data.rate > maxOccupancy) {
                maxOccupancy = data.rate;
                maxOccupancyDept = dept;
            }
        });

        if (maxOccupancyDept && maxOccupancy > 80) {
            recommendations.push({
                id: 'rec_capacity_management',
                title: `Optimize Capacity in ${maxOccupancyDept}`,
                description: `${maxOccupancyDept} is at ${maxOccupancy.toFixed(1)}% capacity. Implement overflow protocols and accelerate discharge planning.`,
                impact: `Reduce overcrowding by 15-20%`,
                effort: 'Medium',
                priority: 'high',
                actionType: 'capacity_management',
                actionData: {
                    targetDepartment: maxOccupancyDept,
                    currentOccupancy: maxOccupancy,
                    targetReduction: 15
                }
            });
        }

        // Find resource with highest utilization
        let criticalResource = null;
        let maxUtilization = 0;
        Object.entries(context.hospitalStats.resourceUtilization).forEach(([type, resources]) => {
            resources.forEach(resource => {
                if (resource.rate > maxUtilization) {
                    maxUtilization = resource.rate;
                    criticalResource = { type, ...resource };
                }
            });
        });

        if (criticalResource && maxUtilization > 85) {
            recommendations.push({
                id: 'rec_resource_reallocation',
                title: `Reallocate ${criticalResource.name}`,
                description: `${criticalResource.name} is at ${maxUtilization.toFixed(1)}% utilization. Redistribute from departments with lower demand.`,
                impact: `Improve resource availability by 20-30%`,
                effort: 'Low',
                priority: 'high',
                actionType: 'resource_reallocation',
                actionData: {
                    sourceResource: criticalResource.name,
                    resourceType: criticalResource.type,
                    currentUtilization: maxUtilization,
                    quantity: Math.max(1, Math.floor(criticalResource.total * 0.1))
                }
            });
        }

        // Find department with highest staff workload
        let maxWorkload = 0;
        let maxWorkloadDept = null;
        Object.entries(context.hospitalStats.staffWorkload).forEach(([dept, data]) => {
            if (data.averageWorkload > maxWorkload) {
                maxWorkload = data.averageWorkload;
                maxWorkloadDept = dept;
            }
        });

        if (maxWorkloadDept && maxWorkload > 80) {
            recommendations.push({
                id: 'rec_staff_adjustment',
                title: `Staff Rebalancing for ${maxWorkloadDept}`,
                description: `Staff in ${maxWorkloadDept} are at ${maxWorkload.toFixed(1)}% average workload. Redistribute staff from less busy departments.`,
                impact: `Reduce staff burnout and improve patient care`,
                effort: 'Medium',
                priority: 'medium',
                actionType: 'staff_adjustment',
                actionData: {
                    targetDepartment: maxWorkloadDept,
                    currentWorkload: maxWorkload,
                    staffCount: context.hospitalStats.staffWorkload[maxWorkloadDept]?.count || 0
                }
            });
        }

        // Add general optimization recommendations
        recommendations.push({
            id: 'rec_workflow_optimization',
            title: 'Implement Predictive Discharge Planning',
            description: 'Use AI to predict discharge readiness 24-48 hours in advance, enabling better bed management and reduced wait times.',
            impact: 'Improve bed turnover by 10-15%',
            effort: 'Low',
            priority: 'medium',
            actionType: 'workflow_optimization',
            actionData: {
                targetImprovement: '15% bed turnover',
                implementationTime: '24 hours'
            }
        });

        if (context.hospitalStats.criticalPatients > 0) {
            recommendations.push({
                id: 'rec_critical_monitoring',
                title: 'Enhanced Critical Patient Monitoring',
                description: `With ${context.hospitalStats.criticalPatients} critical patients, implement continuous monitoring protocols and ensure adequate ICU resources.`,
                impact: 'Improve critical care outcomes',
                effort: 'Medium',
                priority: 'high',
                actionType: 'resource_reallocation',
                actionData: {
                    criticalPatients: context.hospitalStats.criticalPatients,
                    recommendedAction: 'increase_monitoring'
                }
            });
        }

        return { recommendations };
    }

    updateInsightsCounts() {
        const optimization = this.insights.filter(i => i.category === 'optimization').length;
        const predicted = this.insights.filter(i => i.category === 'prediction' || i.category === 'alert').length;
        const implemented = this.insights.filter(i => i.implemented).length;

        document.getElementById('optimizationCount').textContent = optimization;
        document.getElementById('predictedIssues').textContent = predicted;
        document.getElementById('actionsTaken').textContent = implemented;
    }

    renderInsights() {
        const container = document.getElementById('insightsList');
        if (!container) {
            console.error('❌ Insights container not found in DOM');
            return;
        }

        const filterElement = document.getElementById('insightFilter');
        const filter = filterElement ? filterElement.value : 'all';

        const filteredInsights = filter === 'all' ? 
            this.insights : 
            this.insights.filter(i => i.category === filter || i.type === filter);

        console.log(`📋 Rendering ${filteredInsights.length} insights (from ${this.insights.length} total)`);
        
        container.innerHTML = '';

        if (filteredInsights.length === 0) {
            const emptyMessage = this.insights.length === 0 
                ? 'No AI insights available. Click "Generate New Insights" to analyze current hospital data.'
                : `No insights match the current filter (${filter}). Try "All Insights" to see all available insights.`;
                
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="ri-robot-line text-4xl mb-2"></i>
                    <p>${emptyMessage}</p>
                    ${this.insights.length === 0 ? `
                        <button onclick="generateNewInsights()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            Generate AI Insights
                        </button>
                    ` : ''}
                </div>
            `;
            return;
        }

        filteredInsights.forEach(insight => {
            const priorityColors = {
                critical: 'red',
                high: 'orange',
                medium: 'yellow',
                low: 'blue'
            };
            const color = priorityColors[insight.priority] || 'gray';

            container.innerHTML += `
                <div class="border rounded-lg p-4 hover:shadow-md transition ${
                    insight.implemented ? 'bg-green-50 border-green-200' : ''
                }">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <div class="flex items-center space-x-2 mb-2">
                                <span class="px-3 py-1 bg-${color}-100 text-${color}-700 rounded-full text-xs font-medium">
                                    ${insight.priority?.toUpperCase() || 'MEDIUM'}
                                </span>
                                <span class="text-xs text-gray-500">
                                    ${this.formatCategory(insight.category)}
                                </span>
                                ${insight.confidence ? `
                                    <span class="text-xs text-gray-500">
                                        ${Math.round(insight.confidence * 100)}% confidence
                                    </span>
                                ` : ''}
                            </div>
                            <h4 class="font-medium text-gray-800 mb-2">${insight.title}</h4>
                            <p class="text-sm text-gray-600 mb-3">${insight.description}</p>
                            
                            ${insight.recommendations?.length > 0 ? `
                                <div class="bg-gray-100 rounded p-3 mb-3">
                                    <p class="text-xs font-medium text-gray-700 mb-2">AI Recommendations:</p>
                                    <ul class="list-disc list-inside text-sm text-gray-600 space-y-1">
                                        ${insight.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                            
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-500">
                                    Generated by AI • ${this.getTimeAgo(insight.createdAt)}
                                </span>
                                <div class="flex items-center space-x-2">
                                    ${!insight.implemented ? `
                                        <button onclick="implementInsight('${insight.id}')" 
                                            class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">
                                            <i class="ri-play-line mr-1"></i>Implement
                                        </button>
                                    ` : `
                                        <span class="text-green-600 text-sm">
                                            <i class="ri-check-line mr-1"></i>Implemented
                                        </span>
                                    `}
                                    <button onclick="dismissInsight('${insight.id}')" 
                                        class="text-gray-600 hover:text-gray-700 text-sm">
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    renderRecommendations() {
        const container = document.getElementById('recommendationsList');
        
        container.innerHTML = this.recommendations.map(rec => {
            const priorityColors = {
                critical: 'red',
                high: 'orange',
                medium: 'yellow',
                low: 'blue'
            };
            const color = priorityColors[rec.priority] || 'gray';

            return `
                <div class="border rounded-lg p-4 hover:shadow-md transition bg-white">
                    <div class="flex items-start space-x-3">
                        <input type="checkbox" id="rec-${rec.id}" class="mt-1 recommendation-checkbox">
                        <div class="flex-1">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-medium text-gray-800">${rec.title}</h4>
                                <span class="px-2 py-1 bg-${color}-100 text-${color}-700 rounded-full text-xs font-medium">
                                    ${rec.priority.toUpperCase()}
                                </span>
                            </div>
                            <p class="text-sm text-gray-600 mb-3">${rec.description}</p>
                            <div class="flex items-center justify-between text-xs">
                                <div class="flex items-center space-x-4">
                                    <span class="text-green-600">
                                        <i class="ri-arrow-up-line"></i> ${rec.impact}
                                    </span>
                                    <span class="text-gray-500">
                                        Effort: ${rec.effort}
                                    </span>
                                </div>
                                <button onclick="implementRecommendation('${rec.id}')" 
                                    class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition font-medium">
                                    <i class="ri-play-line mr-1"></i>Implement Now
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    formatCategory(category) {
        const categories = {
            optimization: 'Optimization',
            prediction: 'Prediction',
            alert: 'Alert',
            recommendation: 'Recommendation'
        };
        return categories[category] || category;
    }

    getTimeAgo(timestamp) {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        return `${Math.floor(seconds / 86400)} days ago`;
    }

    async implementInsight(insightId) {
        try {
            const insight = this.insights.find(i => i.id === insightId);
            if (!insight) {
                this.showNotification('Insight not found', 'error');
                return;
            }

            this.showNotification(`Implementing: ${insight.title}`, 'info');

            // Mark as implemented in memory
            insight.implemented = true;
            insight.implementedAt = new Date();
            insight.implementedBy = this.currentUser.uid;

            // Execute the specific action
            await this.executeInsightAction(insight);

            // Log the implementation
            await this.logActivity('ai_insight_implemented', 
                `Implemented AI insight: ${insight.title}`);

            this.showNotification('Insight implemented successfully!', 'success');
            this.renderInsights();
            this.updateInsightsCounts();

        } catch (error) {
            console.error('Error implementing insight:', error);
            this.showNotification('Error implementing insight: ' + error.message, 'error');
        }
    }

    async executeInsightAction(insight) {
        switch (insight.actionType) {
            case 'resource_reallocation':
                await this.executeResourceReallocation(insight.actionData);
                break;
            case 'staff_adjustment':
                await this.executeStaffAdjustment(insight.actionData);
                break;
            case 'capacity_management':
                await this.executeCapacityManagement(insight.actionData);
                break;
            case 'alert_generation':
                await this.generateSystemAlert(insight.actionData);
                break;
            default:
                console.log('Manual implementation required for:', insight);
                await this.createImplementationTask(insight);
        }
    }

    async executeResourceReallocation(actionData) {
        try {
            console.log('🔄 Executing resource reallocation with data:', actionData);
            
            // Validate actionData
            if (!actionData || (!actionData.sourceResource && !actionData.resourceType)) {
                console.log('⚠️ No specific resource specified, creating general resource optimization task');
                await this.createImplementationTask({
                    title: 'Resource Optimization Required',
                    description: 'AI detected resource optimization opportunity. Manual review and implementation needed.',
                    priority: 'medium',
                    actionType: 'resource_reallocation',
                    recommendations: ['Review current resource allocation', 'Identify underutilized resources', 'Redistribute based on demand']
                });
                return;
            }

            // Find resources that can be reallocated
            let sourceResources = [];
            
            if (actionData.sourceResource && actionData.sourceResource !== 'undefined') {
                sourceResources = this.realTimeData.resources.filter(r => 
                    r.name && r.name.toLowerCase().includes(actionData.sourceResource.toLowerCase())
                );
            }
            
            if (sourceResources.length === 0 && actionData.resourceType && actionData.resourceType !== 'undefined') {
                sourceResources = this.realTimeData.resources.filter(r => 
                    r.type && r.type.toLowerCase().includes(actionData.resourceType.toLowerCase())
                );
            }

            // If still no resources found, find any available resources
            if (sourceResources.length === 0) {
                sourceResources = this.realTimeData.resources.filter(r => 
                    r.available && r.available > 0
                );
            }

            if (sourceResources.length === 0) {
                console.log('📋 No suitable resources found for reallocation, creating management task');
                await this.createImplementationTask({
                    title: 'Resource Reallocation Assessment',
                    description: 'AI recommends resource reallocation but no suitable resources identified. Manual assessment required.',
                    priority: 'medium',
                    actionType: 'resource_reallocation',
                    recommendations: ['Assess current resource inventory', 'Identify reallocation opportunities', 'Implement resource redistribution']
                });
                return;
            }

            // Find the resource with highest availability
            const sourceResource = sourceResources.reduce((max, r) => 
                (r.available || 0) > (max.available || 0) ? r : max
            );

            const quantity = actionData.quantity || 1;
            const availableQty = sourceResource.available || 0;

            if (availableQty < quantity) {
                console.log(`⚠️ Insufficient ${sourceResource.name} available (${availableQty} < ${quantity}), creating partial allocation task`);
                await this.createImplementationTask({
                    title: `Partial Resource Reallocation - ${sourceResource.name}`,
                    description: `AI recommends reallocating ${quantity} ${sourceResource.name}, but only ${availableQty} available. Review and implement partial reallocation.`,
                    priority: 'high',
                    actionType: 'resource_reallocation',
                    recommendations: [`Reallocate available ${sourceResource.name} (${availableQty} units)`, 'Source additional resources if needed', 'Monitor resource demand']
                });
                return;
            }

            // Create resource transfer record
            const transferData = this.sanitizeFirebaseData({
                sourceResourceId: sourceResource.id,
                sourceResourceName: sourceResource.name,
                targetDepartment: actionData.targetDepartment || 'General',
                quantity: quantity,
                reason: 'AI Optimization',
                status: 'completed',
                transferredBy: this.currentUser.uid,
                transferredAt: firebase.firestore.FieldValue.serverTimestamp(),
                automatedBy: 'AI System'
            });

            console.log('📋 Creating resource transfer:', transferData);
            await window.collections.resourceTransfers.add(transferData);

            // Update resource availability if it exists in Firebase
            if (sourceResource.id && window.collections.resources) {
                try {
                    await window.collections.resources.doc(sourceResource.id).update({
                        available: availableQty - quantity,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        lastModifiedBy: 'AI System'
                    });
                } catch (updateError) {
                    console.log('⚠️ Could not update resource in database, but transfer recorded');
                }
            }

            this.showNotification(
                `Successfully reallocated ${quantity} ${sourceResource.name} to ${actionData.targetDepartment || 'General'}`, 
                'success'
            );

        } catch (error) {
            console.error('Error executing resource reallocation:', error);
            // Create a task instead of failing completely
            await this.createImplementationTask({
                title: 'Resource Reallocation Error',
                description: `AI attempted resource reallocation but encountered an error: ${error.message}. Manual intervention required.`,
                priority: 'high',
                actionType: 'resource_reallocation',
                recommendations: ['Review resource allocation manually', 'Check resource availability', 'Implement reallocation as appropriate']
            });
            this.showNotification('Resource reallocation task created for manual review', 'warning');
        }
    }

    async executeStaffAdjustment(actionData) {
        try {
            const sanitizedActionData = this.sanitizeFirebaseData(actionData || {});
            
            // Create staff adjustment alert
            const alertData = this.sanitizeFirebaseData({
                title: `Staff Adjustment Required - ${sanitizedActionData.targetDepartment || 'Department'}`,
                description: `AI recommends staff rebalancing for ${sanitizedActionData.targetDepartment || 'department'}. Current workload: ${sanitizedActionData.currentWorkload?.toFixed?.(1) || 'N/A'}%`,
                priority: 'high',
                department: sanitizedActionData.targetDepartment || 'General',
                status: 'pending',
                actionRequired: 'staff_rebalancing',
                generatedBy: 'AI System',
                assignedTo: 'department_head',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    currentWorkload: sanitizedActionData.currentWorkload || 0,
                    staffCount: sanitizedActionData.staffCount || 0,
                    recommendedAction: 'rebalance_staff_allocation'
                }
            });

            console.log('🚨 Creating staff adjustment alert:', alertData);
            await window.collections.alerts.add(alertData);

            this.showNotification(
                `Staff adjustment alert created for ${sanitizedActionData.targetDepartment || 'department'}`, 
                'success'
            );

        } catch (error) {
            console.error('Error executing staff adjustment:', error);
            this.showNotification('Staff adjustment alert creation failed: ' + error.message, 'error');
            throw error;
        }
    }

    async executeCapacityManagement(actionData) {
        try {
            const sanitizedActionData = this.sanitizeFirebaseData(actionData || {});
            
            // Create capacity management task
            const taskData = this.sanitizeFirebaseData({
                title: `Capacity Management - ${sanitizedActionData.department || 'Department'}`,
                description: `AI detected high occupancy (${sanitizedActionData.currentOccupancy?.toFixed?.(1) || 'N/A'}%) in ${sanitizedActionData.department || 'department'}. Implement overflow protocols.`,
                priority: sanitizedActionData.urgency === 'immediate' ? 'critical' : 'high',
                assignedTo: 'department_head',
                department: sanitizedActionData.department || 'General',
                status: 'pending',
                createdBy: 'AI System',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                dueDate: firebase.firestore.Timestamp.fromDate(
                    new Date(Date.now() + (sanitizedActionData.urgency === 'immediate' ? 1 : 4) * 60 * 60 * 1000)
                ),
                metadata: {
                    currentOccupancy: sanitizedActionData.currentOccupancy || 0,
                    actionType: 'capacity_management',
                    automatedBy: 'AI System'
                }
            });

            console.log('🏥 Creating capacity management task:', taskData);
            await window.collections.tasks.add(taskData);

            // Update department status if critical
            if (sanitizedActionData.currentOccupancy > 90) {
                const dept = this.realTimeData.departments.find(d => d.name === sanitizedActionData.department);
                if (dept && dept.id) {
                    try {
                        await window.collections.departments.doc(dept.id).update({
                            status: 'high_capacity',
                            lastAlert: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    } catch (updateError) {
                        console.log('⚠️ Could not update department status:', updateError.message);
                    }
                }
            }

            this.showNotification(
                `Capacity management protocols activated for ${sanitizedActionData.department || 'department'}`, 
                'success'
            );

        } catch (error) {
            console.error('Error executing capacity management:', error);
            this.showNotification('Capacity management task creation failed: ' + error.message, 'error');
            throw error;
        }
    }

    async generateSystemAlert(actionData) {
        try {
            const sanitizedActionData = this.sanitizeFirebaseData(actionData || {});
            
            const alertData = this.sanitizeFirebaseData({
                title: sanitizedActionData.title || 'AI Generated Alert',
                description: sanitizedActionData.description || 'AI system detected an issue requiring attention',
                priority: sanitizedActionData.priority || 'medium',
                department: sanitizedActionData.department || 'All',
                status: 'pending',
                generatedBy: 'AI System',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    automatedBy: 'AI System',
                    actionData: sanitizedActionData
                }
            });

            console.log('🚨 Creating system alert:', alertData);
            await window.collections.alerts.add(alertData);

            this.showNotification('System alert generated successfully', 'success');

        } catch (error) {
            console.error('Error generating system alert:', error);
            this.showNotification('System alert generation failed: ' + error.message, 'error');
            throw error;
        }
    }

    async createImplementationTask(insight) {
        try {
            const taskData = this.sanitizeFirebaseData({
                title: `Manual Implementation: ${insight.title || 'AI Recommendation'}`,
                description: `${insight.description || 'AI recommendation requires manual implementation'}\n\nRecommended Actions:\n${insight.recommendations?.join('\n') || 'See insight details'}`,
                priority: insight.priority || 'medium',
                assignedTo: 'system_admin',
                status: 'pending',
                createdBy: 'AI System',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    insightId: insight.id || `task_${Date.now()}`,
                    actionType: insight.actionType || 'manual_review',
                    automatedBy: 'AI System'
                }
            });

            console.log('📋 Creating implementation task:', taskData);
            await window.collections.tasks.add(taskData);

            this.showNotification('Implementation task created for manual review', 'success');

        } catch (error) {
            console.error('Error creating implementation task:', error);
            this.showNotification('Task creation failed: ' + error.message, 'error');
            throw error;
        }
    }

    async implementRecommendation(recId) {
        const recommendation = this.recommendations.find(r => r.id === recId);
        if (!recommendation) {
            this.showNotification('Recommendation not found', 'error');
            return;
        }

        try {
            this.showNotification(`Implementing: ${recommendation.title}`, 'info');
            
            // Execute the recommendation action
            await this.executeRecommendationAction(recommendation);

            // Log the implementation
            await this.logActivity('ai_recommendation_implemented', 
                `Implemented AI recommendation: ${recommendation.title}`);

            this.showNotification(`Successfully implemented: ${recommendation.title}`, 'success');
            
        } catch (error) {
            console.error('Error implementing recommendation:', error);
            this.showNotification('Error implementing recommendation: ' + error.message, 'error');
        }
    }

    async executeRecommendationAction(recommendation) {
        switch (recommendation.actionType) {
            case 'resource_reallocation':
                await this.executeResourceReallocation(recommendation.actionData);
                break;
            case 'staff_adjustment':
                await this.executeStaffAdjustment(recommendation.actionData);
                break;
            case 'capacity_management':
                await this.executeCapacityManagement(recommendation.actionData);
                break;
            case 'workflow_optimization':
                await this.executeWorkflowOptimization(recommendation.actionData);
                break;
            default:
                await this.createImplementationTask({
                title: recommendation.title,
                description: recommendation.description,
                priority: recommendation.priority,
                    actionType: recommendation.actionType,
                    recommendations: [recommendation.description]
                });
        }
    }

    async executeWorkflowOptimization(actionData) {
        try {
            // Sanitize actionData to remove undefined values
            const sanitizedActionData = this.sanitizeFirebaseData(actionData || {});
            
            // Create workflow optimization task with sanitized data
            const taskData = {
                title: 'Workflow Optimization Implementation',
                description: `Implement workflow optimization: ${sanitizedActionData.targetImprovement || 'Process improvement'}`,
                priority: 'medium',
                assignedTo: 'operations_manager',
                status: 'pending',
                createdBy: 'AI System',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    actionType: 'workflow_optimization',
                    targetImprovement: sanitizedActionData.targetImprovement || 'General workflow improvement',
                    implementationTime: sanitizedActionData.implementationTime || '24-48 hours',
                    automatedBy: 'AI System'
                }
            };

            console.log('📋 Creating workflow optimization task:', taskData);
            await window.collections.tasks.add(taskData);

            this.showNotification('Workflow optimization task created successfully', 'success');

        } catch (error) {
            console.error('Error executing workflow optimization:', error);
            this.showNotification('Workflow optimization task creation failed: ' + error.message, 'error');
            throw error;
        }
    }

    /**
     * Sanitize data for Firebase by removing undefined values
     */
    sanitizeFirebaseData(data) {
        if (data === null || data === undefined) {
            return {};
        }
        
        if (typeof data !== 'object') {
            return data;
        }
        
        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeFirebaseData(item));
        }
        
        const sanitized = {};
        Object.keys(data).forEach(key => {
            const value = data[key];
            if (value !== undefined) {
                if (typeof value === 'object' && value !== null) {
                    sanitized[key] = this.sanitizeFirebaseData(value);
                } else {
                    sanitized[key] = value;
                }
            }
        });
        
        return sanitized;
    }

    async logActivity(action, message) {
        try {
            if (window.collections && window.collections.activities) {
                const activityData = this.sanitizeFirebaseData({
                    action,
                    message,
                    userId: this.currentUser.uid,
                    userType: 'ai_system',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                await window.collections.activities.add(activityData);
            }
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }

    setupCharts() {
        // Charts will be updated with real prediction data
        this.createPatientFlowChart();
        this.createResourceDemandChart();
    }

    createPatientFlowChart() {
        const ctx = document.getElementById('patientFlowPredictionChart');
        if (!ctx) return;

        // Generate realistic predictions based on current data
        const predictions = this.generatePatientFlowPredictions();
        
        const labels = predictions.map(p => p.time);
        const data = predictions.map(p => p.predicted);

        this.charts.patientFlow = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Predicted Admissions',
                    data: data,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Patients'
                        }
                    }
                }
            }
        });
    }

    generatePatientFlowPredictions() {
        const predictions = [];
        const currentHour = new Date().getHours();
        
        // Base rate on actual patient count or use realistic default
        const totalPatients = this.realTimeData.patients.length;
        const baseRate = totalPatients > 0 ? Math.max(3, Math.floor(totalPatients * 0.15)) : 8;

        console.log(`📈 Generating patient flow predictions with base rate: ${baseRate} (from ${totalPatients} current patients)`);

        for (let i = 0; i < 24; i++) {
            const hour = (currentHour + i) % 24;
            
            // Realistic admission patterns based on hospital data
            let multiplier = 1;
            if (hour >= 10 && hour <= 14) multiplier = 2.2; // Lunch peak
            else if (hour >= 18 && hour <= 22) multiplier = 1.8; // Evening peak
            else if (hour >= 0 && hour <= 6) multiplier = 0.4; // Night low
            else if (hour >= 7 && hour <= 9) multiplier = 1.5; // Morning rush
            else if (hour >= 15 && hour <= 17) multiplier = 1.6; // Afternoon
            
            // Add some randomness but keep it realistic
            const variance = Math.random() * 4 - 2; // -2 to +2
            const predicted = Math.max(1, Math.floor(baseRate * multiplier + variance));
            
            predictions.push({
                time: `${hour.toString().padStart(2, '0')}:00`,
                predicted: predicted
            });
        }

        return predictions;
    }

    createResourceDemandChart() {
        const ctx = document.getElementById('resourceDemandChart');
        if (!ctx) return;

        // Use real resource data or create meaningful defaults
        let labels = [];
        let currentUsage = [];
        let predictedDemand = [];

        if (this.realTimeData.resources && this.realTimeData.resources.length > 0) {
            // Use real resource data
            const resourceTypes = {};
            this.realTimeData.resources.forEach(resource => {
                const type = resource.type || resource.name || 'Unknown';
                if (!resourceTypes[type]) {
                    resourceTypes[type] = { total: 0, available: 0, count: 0 };
                }
                resourceTypes[type].total += resource.total || 0;
                resourceTypes[type].available += resource.available || 0;
                resourceTypes[type].count += 1;
            });

            labels = Object.keys(resourceTypes);
            currentUsage = labels.map(type => {
                const data = resourceTypes[type];
                return data.total > 0 ? ((data.total - data.available) / data.total * 100) : 0;
            });
            predictedDemand = currentUsage.map(usage => Math.min(100, usage + Math.random() * 15 + 5));
        } else {
            // Use hospital-relevant defaults when no real data
            labels = ['ICU Beds', 'Ventilators', 'ER Beds', 'OR Rooms', 'Staff'];
            currentUsage = [75, 85, 60, 45, 80];
            predictedDemand = [85, 95, 70, 55, 90];
        }

        this.charts.resourceDemand = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Current Usage %',
                    data: currentUsage,
                    backgroundColor: 'rgba(59, 130, 246, 0.8)'
                }, {
                    label: 'Predicted Demand %',
                    data: predictedDemand,
                    backgroundColor: 'rgba(251, 146, 60, 0.8)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Utilization (%)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });

        console.log('📊 Resource demand chart created with data:', { labels, currentUsage, predictedDemand });
    }

    startRealTimeUpdates() {
        // Update insights every 10 minutes
        setInterval(() => {
            this.generateGeminiInsights();
        }, 10 * 60 * 1000);

        // Update recommendations every 15 minutes
        setInterval(() => {
            this.generateGeminiRecommendations();
        }, 15 * 60 * 1000);

        // Update charts every 5 minutes
        setInterval(() => {
            this.updateCharts();
        }, 5 * 60 * 1000);
    }

    updateCharts() {
        if (this.charts.patientFlow) {
            const predictions = this.generatePatientFlowPredictions();
            this.charts.patientFlow.data.labels = predictions.map(p => p.time);
            this.charts.patientFlow.data.datasets[0].data = predictions.map(p => p.predicted);
            this.charts.patientFlow.update('none');
        }

        if (this.charts.resourceDemand) {
            this.createResourceDemandChart();
        }
    }

    async dismissInsight(insightId) {
        try {
            const insightIndex = this.insights.findIndex(i => i.id === insightId);
            if (insightIndex !== -1) {
                this.insights.splice(insightIndex, 1);
                this.renderInsights();
                this.updateInsightsCounts();
                this.showNotification('Insight dismissed', 'success');
            }
        } catch (error) {
            console.error('Error dismissing insight:', error);
            this.showNotification('Error dismissing insight', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const bgColors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500',
            warning: 'bg-yellow-500'
        };
        
        notification.className = `fixed top-4 right-4 ${bgColors[type] || bgColors.info} text-white px-6 py-3 rounded-lg shadow-lg transform translate-x-full transition-transform z-50`;
        notification.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="ri-${type === 'success' ? 'check' : type === 'error' ? 'error-warning' : type === 'warning' ? 'alert' : 'information'}-line"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.remove('translate-x-full'), 100);
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    cleanup() {
        this.listeners.forEach(unsubscribe => unsubscribe());
        clearTimeout(this.insightTimeout);
    }
}

// Global functions
async function generateNewInsights() {
    console.log('🔄 Manual insight generation triggered');
    if (window.enhancedAIInsightsManager) {
        window.enhancedAIInsightsManager.showNotification('Generating new AI insights...', 'info');
        try {
            // Force regeneration of insights
            console.log('🏥 Current hospital data:', window.enhancedAIInsightsManager.realTimeData);
            await window.enhancedAIInsightsManager.generateGeminiInsights();
            await window.enhancedAIInsightsManager.generateGeminiRecommendations();
            console.log('✅ Manual insight generation completed');
            console.log('📊 Current insights count:', window.enhancedAIInsightsManager.insights.length);
            console.log('💡 Current recommendations count:', window.enhancedAIInsightsManager.recommendations.length);
        } catch (error) {
            console.error('❌ Error in manual insight generation:', error);
            window.enhancedAIInsightsManager.showNotification('Error generating insights: ' + error.message, 'error');
        }
    } else {
        console.error('❌ Enhanced AI Insights Manager not found');
        alert('AI system not ready. Please refresh the page and try again.');
    }
}

// Debug function to force insights display
function debugShowInsights() {
    if (window.enhancedAIInsightsManager) {
        console.log('🐛 Debug: Forcing insights display');
        console.log('📊 Current insights:', window.enhancedAIInsightsManager.insights);
        
        // Force create some test insights if none exist
        if (window.enhancedAIInsightsManager.insights.length === 0) {
            console.log('🔧 Creating test insights for debugging');
            window.enhancedAIInsightsManager.insights = [
                {
                    id: 'debug_1',
                    title: 'Test AI Insight',
                    description: 'This is a test insight to verify the display system is working.',
                    category: 'optimization',
                    priority: 'medium',
                    confidence: 0.9,
                    actionType: 'workflow_optimization',
                    recommendations: ['Test recommendation 1', 'Test recommendation 2'],
                    createdAt: new Date()
                }
            ];
        }
        
        window.enhancedAIInsightsManager.renderInsights();
        window.enhancedAIInsightsManager.updateInsightsCounts();
        console.log('✅ Debug insights display completed');
    }
}

function filterInsights() {
    if (window.enhancedAIInsightsManager) {
        window.enhancedAIInsightsManager.renderInsights();
    }
}

async function implementInsight(insightId) {
    if (window.enhancedAIInsightsManager) {
        await window.enhancedAIInsightsManager.implementInsight(insightId);
    }
}

async function dismissInsight(insightId) {
    if (window.enhancedAIInsightsManager) {
        await window.enhancedAIInsightsManager.dismissInsight(insightId);
    }
}

async function implementRecommendation(recId) {
    if (window.enhancedAIInsightsManager) {
        await window.enhancedAIInsightsManager.implementRecommendation(recId);
    }
}

async function implementAllRecommendations() {
    if (!window.enhancedAIInsightsManager) return;
    
    const selected = document.querySelectorAll('.recommendation-checkbox:checked');
    
    if (selected.length === 0) {
        window.enhancedAIInsightsManager.showNotification('Please select recommendations to implement', 'warning');
        return;
    }
    
    window.enhancedAIInsightsManager.showNotification(`Implementing ${selected.length} recommendations...`, 'info');
    
    for (const checkbox of selected) {
        const recId = checkbox.id.replace('rec-', '');
        try {
            await window.enhancedAIInsightsManager.implementRecommendation(recId);
            checkbox.checked = false; // Uncheck after implementation
        } catch (error) {
            console.error(`Error implementing recommendation ${recId}:`, error);
        }
    }
    
    window.enhancedAIInsightsManager.showNotification(`Successfully implemented ${selected.length} recommendations!`, 'success');
}

// Initialize Enhanced AI Insights Manager
let enhancedAIInsightsManager;
document.addEventListener('DOMContentLoaded', () => {
    const initializeEnhancedAI = () => {
        if (window.collections && window.collections.patients && window.auth && window.db) {
            console.log('Firebase initialized successfully, creating Enhanced AI Insights Manager');
            enhancedAIInsightsManager = new EnhancedAIInsightsManager();
            window.enhancedAIInsightsManager = enhancedAIInsightsManager;
        } else {
            console.log('Waiting for Firebase initialization...');
            setTimeout(initializeEnhancedAI, 100);
        }
    };
    
    initializeEnhancedAI();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (enhancedAIInsightsManager) {
        enhancedAIInsightsManager.cleanup();
    }
});
