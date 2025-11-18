// AI-Powered Insights and Recommendations Engine
class AIAssistant {
    constructor() {
        this.insights = [];
        this.predictions = [];
        this.recommendations = [];
        this.alertThresholds = {
            bedOccupancy: 85,
            staffRatio: 0.25,
            equipmentUtilization: 90,
            medicationStock: 20
        };
    }

    async generateInsights() {
        const insights = [];
        
        // Collect current system metrics
        const metrics = await this.collectSystemMetrics();
        
        // Bed occupancy insights
        if (metrics.bedOccupancy > this.alertThresholds.bedOccupancy) {
            insights.push({
                type: 'critical',
                category: 'capacity',
                title: 'High Bed Occupancy Alert',
                description: `Current bed occupancy is at ${metrics.bedOccupancy}%. Consider implementing surge capacity protocols.`,
                recommendations: [
                    'Review discharge-ready patients for expedited release',
                    'Activate overflow bed areas if available',
                    'Consider postponing elective admissions'
                ],
                impact: 'high',
                confidence: 0.95
            });
        }
        
        // Staff optimization insights
        const staffEfficiency = await this.analyzeStaffEfficiency(metrics);
        if (staffEfficiency.needsOptimization) {
            insights.push({
                type: 'warning',
                category: 'staffing',
                title: 'Staff Distribution Optimization Needed',
                description: staffEfficiency.message,
                recommendations: staffEfficiency.recommendations,
                impact: 'medium',
                confidence: 0.88
            });
        }
        
        // Predictive insights
        const predictions = await this.generatePredictions(metrics);
        insights.push(...predictions);
        
        // Resource utilization insights
        const resourceInsights = await this.analyzeResourceUtilization();
        insights.push(...resourceInsights);
        
        return insights;
    }

    async collectSystemMetrics() {
        const metrics = {};
        
        // Get bed occupancy
        const bedsSnapshot = await firebaseConfig.collections.beds.get();
        let occupiedBeds = 0;
        bedsSnapshot.forEach(doc => {
            if (doc.data().status === 'occupied') occupiedBeds++;
        });
        metrics.bedOccupancy = Math.round((occupiedBeds / bedsSnapshot.size) * 100);
        
        // Get patient count
        const patientsSnapshot = await firebaseConfig.collections.patients
            .where('status', '==', 'active')
            .get();
        metrics.activePatients = patientsSnapshot.size;
        
        // Get staff count
        const staffSnapshot = await firebaseConfig.collections.staff
                        .where('status', '==', 'on-duty')
            .get();
        metrics.staffOnDuty = staffSnapshot.size;
        metrics.staffRatio = metrics.staffOnDuty / (metrics.activePatients || 1);
        
        // Get department loads
        const deptSnapshot = await firebaseConfig.collections.departments.get();
        metrics.departments = [];
        deptSnapshot.forEach(doc => {
            const dept = doc.data();
            metrics.departments.push({
                id: doc.id,
                name: dept.name,
                utilization: (dept.currentLoad / dept.capacity) * 100
            });
        });
        
        // Get equipment status
        const equipmentSnapshot = await firebaseConfig.collections.equipment.get();
        metrics.equipment = {
            total: equipmentSnapshot.size,
            available: 0,
            inUse: 0,
            maintenance: 0
        };
        equipmentSnapshot.forEach(doc => {
            const equipment = doc.data();
            if (equipment.status === 'available') metrics.equipment.available++;
            else if (equipment.status === 'in-use') metrics.equipment.inUse++;
            else if (equipment.status === 'maintenance') metrics.equipment.maintenance++;
        });
        
        return metrics;
    }

    async analyzeStaffEfficiency(metrics) {
        const analysis = {
            needsOptimization: false,
            message: '',
            recommendations: []
        };
        
        // Check overall staff ratio
        if (metrics.staffRatio < this.alertThresholds.staffRatio) {
            analysis.needsOptimization = true;
            analysis.message = `Current staff-to-patient ratio (${metrics.staffRatio.toFixed(2)}) is below optimal levels.`;
            analysis.recommendations = [
                'Call in additional on-call staff',
                'Redistribute staff from low-utilization departments',
                'Consider implementing team-based care models'
            ];
        }
        
        // Analyze department-specific staffing
        const criticalDepts = metrics.departments.filter(d => d.utilization > 80);
        if (criticalDepts.length > 0) {
            analysis.needsOptimization = true;
            analysis.message += ` High-utilization departments need additional support: ${criticalDepts.map(d => d.name).join(', ')}.`;
            analysis.recommendations.push(
                'Prioritize staff allocation to high-utilization departments',
                'Implement cross-training programs for flexibility'
            );
        }
        
        return analysis;
    }

    async generatePredictions(metrics) {
        const predictions = [];
        
        // Patient flow prediction
        const historicalData = await this.getHistoricalData();
        const flowPrediction = this.predictPatientFlow(historicalData, metrics);
        
        predictions.push({
            type: 'prediction',
            category: 'patient-flow',
            title: 'Expected Patient Flow - Next 6 Hours',
            description: flowPrediction.summary,
            predictions: flowPrediction.details,
            confidence: flowPrediction.confidence,
            impact: flowPrediction.expectedImpact
        });
        
        // Resource demand prediction
        const resourcePrediction = this.predictResourceDemand(historicalData, metrics);
        if (resourcePrediction.alertNeeded) {
            predictions.push({
                type: 'prediction',
                category: 'resource-demand',
                title: 'Projected Resource Shortage',
                description: resourcePrediction.summary,
                recommendations: resourcePrediction.actions,
                timeframe: resourcePrediction.timeframe,
                confidence: resourcePrediction.confidence,
                impact: 'high'
            });
        }
        
        return predictions;
    }

    async getHistoricalData() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const historicalSnapshot = await firebaseConfig.collections.analytics
            .where('timestamp', '>=', thirtyDaysAgo)
            .orderBy('timestamp')
            .get();
        
        const data = [];
        historicalSnapshot.forEach(doc => {
            data.push(doc.data());
        });
        
        return data;
    }

    predictPatientFlow(historicalData, currentMetrics) {
        // Analyze patterns in historical data
        const currentHour = new Date().getHours();
        const dayOfWeek = new Date().getDay();
        
        // Filter historical data for same time and day patterns
        const relevantData = historicalData.filter(record => {
            if (!record.timestamp) return false;
            const recordDate = record.timestamp.toDate();
            return recordDate.getHours() === currentHour && 
                   recordDate.getDay() === dayOfWeek;
        });
        
        // Calculate average admissions for this time period
        const avgAdmissions = relevantData.reduce((sum, record) => 
            sum + (record.metrics?.admissions || 0), 0) / (relevantData.length || 1);
        
        // Apply seasonal and trend adjustments
        const trendFactor = this.calculateTrendFactor(historicalData);
        const expectedAdmissions = Math.round(avgAdmissions * trendFactor);
        
        return {
            summary: `Expected ${expectedAdmissions} new admissions in the next 6 hours based on historical patterns.`,
            details: {
                expectedAdmissions,
                peakHours: this.identifyPeakHours(relevantData),
                departmentImpact: this.predictDepartmentImpact(expectedAdmissions, currentMetrics)
            },
            confidence: relevantData.length > 10 ? 0.85 : 0.65,
            expectedImpact: expectedAdmissions > 20 ? 'high' : 'moderate'
        };
    }

    calculateTrendFactor(historicalData) {
        // Simple trend analysis - would be more sophisticated in production
        const recentData = historicalData.slice(-7);
        const olderData = historicalData.slice(-14, -7);
        
        if (recentData.length === 0 || olderData.length === 0) return 1.0;
        
        const recentAvg = recentData.reduce((sum, record) => 
            sum + (record.metrics?.activePatients || 0), 0) / recentData.length;
        const olderAvg = olderData.reduce((sum, record) => 
            sum + (record.metrics?.activePatients || 0), 0) / olderData.length;
        
        return recentAvg / (olderAvg || 1);
    }

    identifyPeakHours(data) {
        const hourCounts = {};
        data.forEach(record => {
            const hour = record.timestamp?.toDate().getHours();
            if (hour !== undefined) {
                hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            }
        });
        
        const sortedHours = Object.entries(hourCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([hour]) => parseInt(hour));
        
        return sortedHours;
    }

    predictDepartmentImpact(expectedAdmissions, currentMetrics) {
        const impact = {};
        
        // Distribute expected admissions based on historical department patterns
        const distributionRates = {
            'Emergency': 0.4,
            'ICU': 0.15,
            'General Ward': 0.3,
            'Pediatrics': 0.1,
            'Surgery': 0.05
        };
        
        currentMetrics.departments.forEach(dept => {
            const expectedLoad = expectedAdmissions * (distributionRates[dept.name] || 0.1);
            const newUtilization = ((dept.utilization / 100 * dept.capacity + expectedLoad) / dept.capacity) * 100;
            
            impact[dept.name] = {
                expectedAdmissions: Math.round(expectedLoad),
                projectedUtilization: Math.round(newUtilization),
                status: newUtilization > 90 ? 'critical' : newUtilization > 75 ? 'warning' : 'normal'
            };
        });
        
        return impact;
    }

    predictResourceDemand(historicalData, currentMetrics) {
        const prediction = {
            alertNeeded: false,
            summary: '',
            actions: [],
            timeframe: '4-6 hours',
            confidence: 0.75
        };
        
        // Analyze equipment utilization trends
        const utilizationRate = (currentMetrics.equipment.inUse / currentMetrics.equipment.total) * 100;
        
        if (utilizationRate > this.alertThresholds.equipmentUtilization) {
            prediction.alertNeeded = true;
            prediction.summary = `Equipment utilization is at ${utilizationRate.toFixed(1)}%. Critical shortage expected within ${prediction.timeframe}.`;
            prediction.actions = [
                'Expedite equipment cleaning and turnaround',
                'Request equipment loans from partner facilities',
                'Prioritize equipment allocation to critical cases'
            ];
        }
        
        return prediction;
    }

    async analyzeResourceUtilization() {
        const insights = [];
        
        // Analyze medication stock levels
        const medsSnapshot = await firebaseConfig.collections.medications.get();
        const criticalMeds = [];
        
        medsSnapshot.forEach(doc => {
            const med = doc.data();
            const stockPercentage = (med.currentStock / med.minStock) * 100;
            
            if (stockPercentage < this.alertThresholds.medicationStock) {
                criticalMeds.push({
                    name: med.name,
                    currentStock: med.currentStock,
                    daysRemaining: this.calculateDaysRemaining(med)
                });
            }
        });
        
        if (criticalMeds.length > 0) {
            insights.push({
                type: 'warning',
                category: 'inventory',
                title: 'Critical Medication Stock Levels',
                description: `${criticalMeds.length} medications are below minimum stock levels.`,
                items: criticalMeds,
                recommendations: [
                    'Place urgent orders for critical medications',
                    'Implement conservation protocols',
                    'Review alternative medication options'
                ],
                impact: 'high',
                confidence: 0.95
            });
        }
        
        // Analyze bed turnover efficiency
        const turnoverInsight = await this.analyzeBedTurnover();
        if (turnoverInsight) {
            insights.push(turnoverInsight);
        }
        
        return insights;
    }

    calculateDaysRemaining(medication) {
        // Simplified calculation - would use actual consumption data in production
        const dailyUsage = medication.averageDailyUsage || 10;
        return Math.floor(medication.currentStock / dailyUsage);
    }

    async analyzeBedTurnover() {
        const last7Days = new Date();
        last7Days.setDate(last7Days.getDate() - 7);
        
        const dischargeSnapshot = await firebaseConfig.collections.activities
            .where('type', '==', 'discharge')
            .where('timestamp', '>=', last7Days)
            .get();
        
        const avgTurnoverTime = 4; // hours - would calculate from actual data
        
        if (avgTurnoverTime > 3) {
            return {
                type: 'optimization',
                category: 'efficiency',
                title: 'Bed Turnover Optimization Opportunity',
                description: `Average bed turnover time is ${avgTurnoverTime} hours. Industry best practice is under 2 hours.`,
                recommendations: [
                    'Implement parallel discharge and admission processes',
                    'Pre-stage cleaning supplies near high-turnover units',
                    'Create dedicated turnover teams during peak hours'
                ],
                potentialGain: 'Could increase bed availability by 15-20%',
                impact: 'medium',
                confidence: 0.82
            };
        }
        
        return null;
    }

    // Generate natural language summaries
    async generateNLPSummary(insights) {
        const criticalInsights = insights.filter(i => i.impact === 'high');
        const warnings = insights.filter(i => i.type === 'warning');
        const optimizations = insights.filter(i => i.type === 'optimization');
        
        let summary = `System Analysis Summary (${new Date().toLocaleString()}):\n\n`;
        
        if (criticalInsights.length > 0) {
            summary += `🚨 CRITICAL ALERTS (${criticalInsights.length}):\n`;
            criticalInsights.forEach(insight => {
                summary += `• ${insight.title}: ${insight.description}\n`;
            });
            summary += '\n';
        }
        
        if (warnings.length > 0) {
            summary += `⚠️ WARNINGS (${warnings.length}):\n`;
            warnings.forEach(insight => {
                summary += `• ${insight.title}: ${insight.description}\n`;
            });
            summary += '\n';
        }
        
        if (optimizations.length > 0) {
            summary += `💡 OPTIMIZATION OPPORTUNITIES (${optimizations.length}):\n`;
            optimizations.forEach(insight => {
                summary += `• ${insight.title}: ${insight.potentialGain || insight.description}\n`;
            });
        }
        
        return summary;
    }

    // Store insights in Firebase
    async saveInsights(insights) {
        const batch = firebaseConfig.db.batch();
        
        insights.forEach(insight => {
            const docRef = firebaseConfig.collections.aiInsights.doc();
            batch.set(docRef, {
                ...insight,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active',
                                reviewed: false,
                implementationStatus: 'pending'
            });
        });
        
        await batch.commit();
    }

    // Monitor and update insight effectiveness
    async trackInsightEffectiveness(insightId, action) {
        const insightRef = firebaseConfig.collections.aiInsights.doc(insightId);
        
        await insightRef.update({
            [`feedback.${action}`]: firebase.firestore.FieldValue.increment(1),
            lastInteraction: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    // Generate automated reports
    async generateDailyReport() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const report = {
            date: today,
            type: 'daily',
            sections: {
                executive_summary: await this.generateExecutiveSummary(),
                key_metrics: await this.compileDailyMetrics(),
                insights_summary: await this.compileInsightsSummary(today),
                recommendations: await this.prioritizeRecommendations(),
                predictions: await this.compile24HourPredictions()
            },
            generated_at: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Save report
        await firebaseConfig.collections.reports.add(report);
        
        return report;
    }

    async generateExecutiveSummary() {
        const metrics = await this.collectSystemMetrics();
        
        return {
            overall_status: this.determineOverallStatus(metrics),
            key_highlights: [
                `Bed occupancy: ${metrics.bedOccupancy}%`,
                `Active patients: ${metrics.activePatients}`,
                `Staff on duty: ${metrics.staffOnDuty}`,
                `Critical alerts: ${metrics.criticalAlerts || 0}`
            ],
            areas_of_concern: this.identifyAreasOfConcern(metrics),
            positive_trends: this.identifyPositiveTrends(metrics)
        };
    }

    determineOverallStatus(metrics) {
        if (metrics.bedOccupancy > 90 || metrics.staffRatio < 0.2) {
            return 'critical';
        } else if (metrics.bedOccupancy > 80 || metrics.staffRatio < 0.25) {
            return 'warning';
        }
        return 'normal';
    }

    identifyAreasOfConcern(metrics) {
        const concerns = [];
        
        if (metrics.bedOccupancy > 85) {
            concerns.push('High bed occupancy may impact emergency admissions');
        }
        
        if (metrics.staffRatio < 0.25) {
            concerns.push('Staff-to-patient ratio below recommended levels');
        }
        
        const criticalDepts = metrics.departments.filter(d => d.utilization > 90);
        if (criticalDepts.length > 0) {
            concerns.push(`${criticalDepts.length} departments at critical capacity`);
        }
        
        return concerns;
    }

    identifyPositiveTrends(metrics) {
        const trends = [];
        
        if (metrics.equipment.available > metrics.equipment.total * 0.3) {
            trends.push('Good equipment availability maintained');
        }
        
        if (metrics.bedOccupancy < 70) {
            trends.push('Comfortable bed capacity available');
        }
        
        return trends;
    }
}

// Export AI Assistant
window.AIAssistant = AIAssistant;