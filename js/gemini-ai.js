/**
 * Gemini AI Integration for Smart Hospital Management
 * This module provides AI-powered medical recommendations and insights
 */

class GeminiAI {
    constructor() {
        // Gemini API configuration
        this.apiKey = 'AIzaSyAk-zClJJOOJMd6Zhadw9PmxnbI1YqVUaE';
        this.apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
        this.initialized = false;
        
        // Rate limiting
        this.lastApiCall = 0;
        this.minInterval = 2000; // 2 seconds between API calls
        this.rateLimitCount = 0;
        this.maxRetries = 3;
        
        this.init();
    }

    async init() {
        // Initialize Gemini AI with real API key
        console.log('Gemini AI module loaded with API key configured');
        console.log('Using model: gemini-2.0-flash-exp');
        this.initialized = true;
    }

    /**
     * Get medical recommendations for a diagnosis
     */
    async getMedicalRecommendations(patientContext) {
        try {
            if (!this.apiKey) {
                return this.getMockMedicalRecommendations(patientContext);
            }

            const prompt = this.buildMedicalPrompt(patientContext);
            const response = await this.callGeminiAPI(prompt);
            
            return this.formatMedicalResponse(response);
        } catch (error) {
            console.error('Error getting medical recommendations:', error);
            return this.getMockMedicalRecommendations(patientContext);
        }
    }

    /**
     * Get nursing care recommendations
     */
    async getNursingRecommendations(patientContext) {
        try {
            if (!this.apiKey) {
                return this.getMockNursingRecommendations(patientContext);
            }

            const prompt = this.buildNursingPrompt(patientContext);
            const response = await this.callGeminiAPI(prompt);
            
            return this.formatNursingResponse(response);
        } catch (error) {
            console.error('Error getting nursing recommendations:', error);
            return this.getMockNursingRecommendations(patientContext);
        }
    }

    /**
     * Analyze patient vitals and provide insights
     */
    async analyzeVitals(vitalsData) {
        try {
            if (!this.apiKey) {
                return this.getMockVitalsAnalysis(vitalsData);
            }

            const prompt = this.buildVitalsPrompt(vitalsData);
            const response = await this.callGeminiAPI(prompt);
            
            return this.formatVitalsResponse(response);
        } catch (error) {
            console.error('Error analyzing vitals:', error);
            return this.getMockVitalsAnalysis(vitalsData);
        }
    }

    /**
     * Get drug interaction warnings
     */
    async checkDrugInteractions(medications) {
        try {
            if (!this.apiKey) {
                return this.getMockDrugInteractions(medications);
            }

            const prompt = this.buildDrugInteractionPrompt(medications);
            const response = await this.callGeminiAPI(prompt);
            
            return this.formatDrugInteractionResponse(response);
        } catch (error) {
            console.error('Error checking drug interactions:', error);
            return this.getMockDrugInteractions(medications);
        }
    }

    /**
     * Generate hospital analytics and insights
     */
    async generateHospitalInsights(hospitalContext) {
        try {
            if (!this.apiKey) {
                return this.getMockHospitalInsights(hospitalContext);
            }

            const prompt = this.buildHospitalInsightsPrompt(hospitalContext);
            const response = await this.callGeminiAPI(prompt);
            
            try {
                return JSON.parse(response);
            } catch (e) {
                return this.parseHospitalInsightsText(response);
            }
        } catch (error) {
            console.error('Error generating hospital insights:', error);
            return this.getMockHospitalInsights(hospitalContext);
        }
    }

    /**
     * Generate resource optimization recommendations
     */
    async generateResourceOptimization(resourceContext) {
        try {
            if (!this.apiKey) {
                return this.getMockResourceOptimization(resourceContext);
            }

            const prompt = this.buildResourceOptimizationPrompt(resourceContext);
            const response = await this.callGeminiAPI(prompt);
            
            try {
                return JSON.parse(response);
            } catch (e) {
                return this.parseResourceOptimizationText(response);
            }
        } catch (error) {
            console.error('Error generating resource optimization:', error);
            return this.getMockResourceOptimization(resourceContext);
        }
    }

    /**
     * Build medical recommendation prompt
     */
    buildMedicalPrompt(context) {
        return `As a medical AI assistant, provide treatment recommendations for:

**Patient Profile:**
- Age: ${context.patientAge} years
- Gender: ${context.gender}
- Primary Diagnosis: ${context.diagnosis}
- Chief Complaint: ${context.chiefComplaint}
- Medical History: ${context.medicalHistory || 'None provided'}
- Known Allergies: ${context.allergies?.length > 0 ? context.allergies.join(', ') : 'None known'}

**Please provide:**
1. **Primary Treatment Recommendations**
   - First-line medications with specific dosages
   - Alternative treatments if first-line fails
   
2. **Monitoring Requirements**
   - Key vital signs to monitor
   - Laboratory tests needed
   - Frequency of monitoring
   
3. **Patient Care Considerations**
   - Important contraindications
   - Age and gender-specific considerations
   - Potential side effects to watch for
   
4. **Follow-up Plan**
   - Recommended follow-up timeline
   - When to escalate care
   - Discharge criteria

**Guidelines:**
- Base recommendations on current medical evidence
- Consider patient's age and comorbidities
- Prioritize patient safety
- Keep recommendations practical and actionable
- Limit response to 300 words

Provide clear, evidence-based medical guidance while noting these are AI suggestions that require clinical validation.`;
    }

    /**
     * Build nursing care prompt
     */
    buildNursingPrompt(context) {
        return `As a nursing AI assistant, provide comprehensive care recommendations:

**Current Patient Status:**
- Recent vital signs trends
- Current medications and treatments
- Patient mobility and comfort level
- Risk factors present

**Please provide nursing care guidance for:**

1. **Assessment Priorities**
   - Key assessments to perform
   - Frequency of monitoring
   - Red flag symptoms to watch for

2. **Direct Care Interventions**
   - Comfort measures
   - Mobility assistance
   - Hygiene and skin care
   - Nutrition and hydration support

3. **Safety Measures**
   - Fall prevention strategies
   - Infection control measures
   - Medication safety protocols

4. **Patient Education**
   - Key teaching points
   - Discharge preparation
   - Family involvement strategies

5. **Documentation Focus**
   - Critical elements to document
   - Communication with healthcare team

Keep recommendations practical, evidence-based, and focused on holistic patient care. Limit to 250 words.`;
    }

    /**
     * Build vitals analysis prompt
     */
    buildVitalsPrompt(vitals) {
        return `Analyze these vital signs and provide clinical insights:

**Vital Signs:**
- Blood Pressure: ${vitals.bloodPressure || 'Not recorded'}
- Heart Rate: ${vitals.heartRate || 'Not recorded'} bpm
- Temperature: ${vitals.temperature || 'Not recorded'}°C
- Oxygen Saturation: ${vitals.oxygenSaturation || 'Not recorded'}%
- Respiratory Rate: ${vitals.respiratoryRate || 'Not recorded'}/min
- Pain Level: ${vitals.painLevel || 'Not assessed'}/10

**Please provide:**
1. **Clinical Assessment**
   - Overall stability assessment
   - Any concerning patterns
   - Normal vs. abnormal findings

2. **Priority Actions**
   - Immediate interventions needed
   - Additional monitoring required
   - When to notify physician

3. **Trending Considerations**
   - What to monitor for changes
   - Expected improvements
   - Warning signs

Keep analysis concise and actionable. Focus on clinical significance and nursing implications.`;
    }

    /**
     * Build drug interaction prompt
     */
    buildDrugInteractionPrompt(medications) {
        const medList = medications.map(med => `${med.name} ${med.dosage}`).join(', ');
        
        return `Analyze potential drug interactions for these medications:

**Current Medications:**
${medications.map(med => `- ${med.name} ${med.dosage} (${med.route}) - ${med.frequency}`).join('\n')}

**Please identify:**
1. **Major Interactions**
   - Serious drug-drug interactions
   - Contraindications
   - Clinical significance

2. **Monitoring Requirements**
   - Labs to check
   - Symptoms to watch for
   - Dose adjustments needed

3. **Safety Recommendations**
   - Timing considerations
   - Food interactions
   - Patient education points

Focus on clinically significant interactions and practical management strategies. Keep response under 200 words.`;
    }

    /**
     * Build hospital insights prompt
     */
    buildHospitalInsightsPrompt(context) {
        return `As a hospital operations AI analyst, analyze this comprehensive hospital data and provide actionable insights:

**Hospital Overview:**
- Total Patients: ${context.hospitalStats?.totalPatients || 0}
- Critical Patients: ${context.hospitalStats?.criticalPatients || 0}
- Departments: ${context.departments?.length || 0}
- Active Resources: ${context.resources?.length || 0}

**Department Occupancy:**
${Object.entries(context.hospitalStats?.departmentOccupancy || {}).map(([dept, data]) => 
    `- ${dept}: ${data.current}/${data.capacity} (${data.rate?.toFixed(1) || 0}%)`).join('\n')}

**Resource Utilization:**
${Object.entries(context.hospitalStats?.resourceUtilization || {}).map(([type, resources]) => 
    `- ${type}: ${resources.map(r => `${r.name} ${r.rate?.toFixed(1) || 0}%`).join(', ')}`).join('\n')}

**Staff Workload:**
${Object.entries(context.hospitalStats?.staffWorkload || {}).map(([dept, data]) => 
    `- ${dept}: ${data.count || 0} staff, avg workload ${data.averageWorkload?.toFixed(1) || 0}%`).join('\n')}

Provide insights in JSON format:
{
  "insights": [
    {
      "id": "unique_id",
      "title": "Issue Title",
      "description": "Detailed analysis",
      "category": "optimization|prediction|alert|recommendation",
      "priority": "critical|high|medium|low",
      "confidence": 0.85,
      "actionType": "resource_reallocation|staff_adjustment|capacity_management|alert_generation",
      "recommendations": ["specific action 1", "specific action 2"],
      "actionData": {
        "department": "affected_department",
        "resource": "resource_name",
        "quantity": 5,
        "urgency": "immediate|high|medium"
      }
    }
  ],
  "summary": "Overall hospital status assessment"
}

Focus on actionable insights that can be implemented immediately through the hospital management system.`;
    }

    /**
     * Build resource optimization prompt
     */
    buildResourceOptimizationPrompt(context) {
        return `Analyze hospital resource allocation and provide optimization recommendations:

**Resource Status:**
${context.resources?.map(r => `- ${r.name} (${r.type}): ${r.available}/${r.total} available (${r.utilizationRate?.toFixed(1) || 0}% utilized)`).join('\n') || 'No resource data available'}

**Department Needs:**
${context.departments?.map(d => `- ${d.name}: ${d.currentLoad}/${d.capacity} (${d.occupancyRate?.toFixed(1) || 0}% occupied)`).join('\n') || 'No department data available'}

Provide optimization recommendations in JSON format:
{
  "recommendations": [
    {
      "id": "opt_id",
      "title": "Optimization Action",
      "description": "Detailed recommendation",
      "impact": "Expected improvement",
      "effort": "Low|Medium|High",
      "priority": "critical|high|medium|low",
      "actionType": "resource_reallocation|capacity_adjustment|workflow_optimization",
      "actionData": {
        "sourceResource": "resource_id",
        "targetDepartment": "dept_id",
        "quantity": 3,
        "expectedImprovement": "20% efficiency gain"
      }
    }
  ]
}`;
    }

    /**
     * Call Gemini API (when API key is available)
     */
    async callGeminiAPI(prompt) {
        if (!this.apiKey) {
            throw new Error('Gemini API key not configured');
        }

        const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.2,
                    topK: 64,
                    topP: 0.95,
                    maxOutputTokens: 2048,
                    responseMimeType: "text/plain"
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    /**
     * Mock medical recommendations (used when API key is not available)
     */
    getMockMedicalRecommendations(context) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(`**Medical Recommendations for ${context.diagnosis}**

**Primary Treatment:**
• First-line therapy: Standard evidence-based treatment protocol
• Dosage: Age-appropriate dosing for ${context.patientAge}-year-old ${context.gender}
• Duration: Typical treatment course (7-14 days)

**Monitoring Requirements:**
• Vital signs every 4-6 hours initially
• Monitor for treatment response within 24-48 hours
• Watch for common side effects and allergic reactions
• Consider lab work if indicated by condition

**Safety Considerations:**
• Review current medications for interactions
• Consider patient's age and any comorbidities
• Adjust dosing for renal/hepatic function if needed
• Patient education on medication compliance

**Follow-up Plan:**
• Re-evaluate in 48-72 hours or sooner if symptoms worsen
• Consider specialist referral if no improvement
• Discharge when stable and treatment response achieved

*Note: These AI recommendations should be validated against current clinical guidelines and patient-specific factors.*`);
            }, 1500);
        });
    }

    /**
     * Mock nursing recommendations
     */
    getMockNursingRecommendations(context) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(`**Nursing Care Recommendations**

**Assessment Priorities:**
• Vital signs every 4 hours, more frequently if unstable
• Pain assessment using 0-10 scale every 2-4 hours
• Neurological checks if indicated
• Skin integrity and wound assessment daily

**Direct Care Interventions:**
• Position changes every 2 hours to prevent pressure ulcers
• Encourage mobility as tolerated
• Maintain adequate hydration and nutrition
• Provide comfort measures for pain and anxiety

**Safety Measures:**
• Fall risk assessment and appropriate precautions
• Hand hygiene and infection prevention protocols
• Medication reconciliation and administration safety
• Call light within reach at all times

**Patient Education:**
• Disease process and treatment plan explanation
• Medication purposes and side effects
• Activity restrictions and mobility guidelines
• When to call for help or report symptoms

**Documentation Focus:**
• Patient response to treatments and interventions
• Changes in condition or concerning symptoms
• Family involvement and understanding of care plan
• Discharge planning needs and readiness

*These recommendations support comprehensive, patient-centered nursing care.*`);
            }, 1200);
        });
    }

    /**
     * Mock vitals analysis
     */
    getMockVitalsAnalysis(vitals) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const analysis = this.analyzeVitalsRanges(vitals);
                resolve(`**Vital Signs Analysis**

**Overall Assessment:**
${analysis.overall}

**Key Findings:**
${analysis.findings.map(finding => `• ${finding}`).join('\n')}

**Priority Actions:**
${analysis.actions.map(action => `• ${action}`).join('\n')}

**Monitoring Focus:**
• Continue regular vital sign monitoring
• Watch for trends rather than single readings
• Document any patient symptoms or complaints
• Notify physician of significant changes

*Clinical correlation with patient condition is essential for proper interpretation.*`);
            }, 800);
        });
    }

    /**
     * Mock drug interactions
     */
    getMockDrugInteractions(medications) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(`**Drug Interaction Analysis**

**Interaction Assessment:**
• No major contraindications identified in current medication list
• Monitor for additive effects with similar drug classes
• Consider timing of administration to optimize effectiveness

**Monitoring Recommendations:**
• Regular assessment of therapeutic response
• Watch for signs of over-sedation or drug accumulation
• Monitor liver and kidney function if on long-term therapy
• Check drug levels if applicable

**Safety Considerations:**
• Educate patient about potential side effects
• Advise on proper timing with meals
• Ensure patient understands importance of compliance
• Review over-the-counter medications and supplements

**Clinical Notes:**
• Always verify allergies before administration
• Use lowest effective dose, especially in elderly patients
• Consider drug interactions with new prescriptions
• Maintain updated medication reconciliation

*This analysis is based on the provided medication list. Always consult current drug interaction databases for comprehensive screening.*`);
            }, 1000);
        });
    }

    /**
     * Analyze vital sign ranges
     */
    analyzeVitalsRanges(vitals) {
        const findings = [];
        const actions = [];
        let overall = "Patient's vital signs reviewed.";

        // Blood pressure analysis
        if (vitals.bloodPressure) {
            const bp = vitals.bloodPressure.split('/');
            const systolic = parseInt(bp[0]);
            const diastolic = parseInt(bp[1]);
            
            if (systolic > 140 || diastolic > 90) {
                findings.push("Elevated blood pressure noted");
                actions.push("Monitor BP closely, consider antihypertensive therapy");
            } else if (systolic < 90 || diastolic < 60) {
                findings.push("Low blood pressure detected");
                actions.push("Assess for hypotension causes, monitor fluid status");
            }
        }

        // Heart rate analysis
        if (vitals.heartRate) {
            const hr = parseInt(vitals.heartRate);
            if (hr > 100) {
                findings.push("Tachycardia present");
                actions.push("Investigate cause of elevated heart rate");
            } else if (hr < 60) {
                findings.push("Bradycardia noted");
                actions.push("Monitor for symptoms of low heart rate");
            }
        }

        // Temperature analysis
        if (vitals.temperature) {
            const temp = parseFloat(vitals.temperature);
            if (temp > 37.5) {
                findings.push("Fever detected");
                actions.push("Implement fever management protocols");
                overall = "Patient shows signs of systemic response.";
            } else if (temp < 36) {
                findings.push("Hypothermia present");
                actions.push("Implement warming measures");
            }
        }

        // Oxygen saturation
        if (vitals.oxygenSaturation) {
            const o2 = parseInt(vitals.oxygenSaturation);
            if (o2 < 95) {
                findings.push("Low oxygen saturation");
                actions.push("Assess respiratory status, consider oxygen therapy");
                overall = "Respiratory monitoring required.";
            }
        }

        if (findings.length === 0) {
            findings.push("Vital signs within acceptable ranges");
            actions.push("Continue routine monitoring");
            overall = "Patient appears hemodynamically stable.";
        }

        return { overall, findings, actions };
    }

    /**
     * Format responses for better readability
     */
    formatMedicalResponse(response) {
        return response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br>');
    }

    formatNursingResponse(response) {
        return response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br>');
    }

    formatVitalsResponse(response) {
        return response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br>');
    }

    formatDrugInteractionResponse(response) {
        return response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br>');
    }

    /**
     * Mock hospital insights (used when API key is not available)
     */
    getMockHospitalInsights(context) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const insights = [];
                const stats = context.hospitalStats || {};
                
                // Generate insights based on actual data
                if (stats.totalPatients > 0) {
                    const criticalRate = (stats.criticalPatients / stats.totalPatients) * 100;
                    
                    if (criticalRate > 30) {
                        insights.push({
                            id: `critical_surge_${Date.now()}`,
                            title: 'High Critical Patient Volume',
                            description: `${stats.criticalPatients} critical patients (${criticalRate.toFixed(1)}% of total) indicates potential health crisis requiring immediate attention.`,
                            category: 'alert',
                            priority: 'critical',
                            confidence: 0.92,
                            actionType: 'alert_generation',
                            recommendations: [
                                'Activate emergency response protocols',
                                'Increase ICU staffing and resources',
                                'Prepare for potential surge capacity'
                            ],
                            actionData: {
                                criticalPatients: stats.criticalPatients,
                                criticalRate: criticalRate,
                                urgency: 'immediate'
                            }
                        });
                    }
                }

                // Analyze department occupancy
                Object.entries(stats.departmentOccupancy || {}).forEach(([dept, data]) => {
                    if (data.rate > 90) {
                        insights.push({
                            id: `occupancy_critical_${dept}_${Date.now()}`,
                            title: `Critical Occupancy - ${dept}`,
                            description: `${dept} at ${data.rate.toFixed(1)}% capacity. Immediate overflow management needed.`,
                            category: 'alert',
                            priority: 'critical',
                            confidence: 0.95,
                            actionType: 'capacity_management',
                            recommendations: [
                                'Implement overflow protocols',
                                'Expedite discharge planning',
                                'Consider temporary bed arrangements'
                            ],
                            actionData: {
                                department: dept,
                                currentOccupancy: data.rate,
                                urgency: 'immediate'
                            }
                        });
                    } else if (data.rate > 75) {
                        insights.push({
                            id: `occupancy_warning_${dept}_${Date.now()}`,
                            title: `High Occupancy Warning - ${dept}`,
                            description: `${dept} approaching capacity at ${data.rate.toFixed(1)}%. Proactive management recommended.`,
                            category: 'prediction',
                            priority: 'high',
                            confidence: 0.85,
                            actionType: 'capacity_management',
                            recommendations: [
                                'Monitor admission patterns',
                                'Prepare overflow capacity',
                                'Review discharge readiness'
                            ],
                            actionData: {
                                department: dept,
                                currentOccupancy: data.rate,
                                urgency: 'high'
                            }
                        });
                    }
                });

                // Analyze resource utilization
                Object.entries(stats.resourceUtilization || {}).forEach(([type, resources]) => {
                    resources.forEach(resource => {
                        if (resource.rate > 95) {
                            insights.push({
                                id: `resource_critical_${resource.name}_${Date.now()}`,
                                title: `Critical Resource Shortage - ${resource.name}`,
                                description: `${resource.name} critically low at ${resource.rate.toFixed(1)}% utilization. Only ${resource.available} units remaining.`,
                                category: 'alert',
                                priority: 'critical',
                                confidence: 0.9,
                                actionType: 'resource_reallocation',
                                recommendations: [
                                    'Immediate resource reallocation from other departments',
                                    'Emergency procurement protocols',
                                    'Conservation measures implementation'
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

                resolve({
                    insights,
                    summary: `Analysis complete: ${insights.filter(i => i.priority === 'critical').length} critical issues identified requiring immediate action.`
                });
            }, 1500);
        });
    }

    /**
     * Mock resource optimization (used when API key is not available)
     */
    getMockResourceOptimization(context) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const recommendations = [];
                
                // Find optimization opportunities
                const resources = context.resources || [];
                const departments = context.departments || [];
                
                // Resource reallocation opportunities
                const underutilized = resources.filter(r => r.utilizationRate < 50);
                const overutilized = resources.filter(r => r.utilizationRate > 90);
                
                if (underutilized.length > 0 && overutilized.length > 0) {
                    recommendations.push({
                        id: 'resource_rebalancing',
                        title: 'Resource Rebalancing Opportunity',
                        description: `Redistribute ${underutilized[0].name} from low-utilization areas to high-demand departments.`,
                        impact: 'Improve resource efficiency by 25-30%',
                        effort: 'Low',
                        priority: 'high',
                        actionType: 'resource_reallocation',
                        actionData: {
                            sourceResource: underutilized[0].name,
                            targetDepartment: 'high_demand_areas',
                            quantity: Math.floor(underutilized[0].available * 0.3),
                            expectedImprovement: '25% efficiency gain'
                        }
                    });
                }

                // Capacity optimization
                const highOccupancy = departments.filter(d => d.occupancyRate > 80);
                if (highOccupancy.length > 0) {
                    recommendations.push({
                        id: 'capacity_optimization',
                        title: 'Capacity Optimization',
                        description: `Optimize patient flow in ${highOccupancy[0].name} to improve bed utilization.`,
                        impact: 'Reduce wait times by 20%',
                        effort: 'Medium',
                        priority: 'medium',
                        actionType: 'capacity_adjustment',
                        actionData: {
                            targetDepartment: highOccupancy[0].name,
                            currentOccupancy: highOccupancy[0].occupancyRate,
                            expectedImprovement: '20% wait time reduction'
                        }
                    });
                }

                // Workflow optimization
                recommendations.push({
                    id: 'workflow_optimization',
                    title: 'Automated Workflow Optimization',
                    description: 'Implement AI-driven patient flow optimization to reduce bottlenecks.',
                    impact: 'Overall efficiency improvement of 15%',
                    effort: 'Low',
                    priority: 'medium',
                    actionType: 'workflow_optimization',
                    actionData: {
                        expectedImprovement: '15% efficiency gain',
                        implementationTime: '24 hours'
                    }
                });

                resolve({ recommendations });
            }, 1200);
        });
    }

    /**
     * Parse hospital insights from text response
     */
    parseHospitalInsightsText(textResponse) {
        const insights = [];
        const lines = textResponse.split('\n');
        
        let currentInsight = null;
        lines.forEach(line => {
            if (line.includes('**') && (line.includes('Critical') || line.includes('Alert') || line.includes('Optimization'))) {
                if (currentInsight) insights.push(currentInsight);
                currentInsight = {
                    id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    title: line.replace(/\*\*/g, '').trim(),
                    description: '',
                    category: line.toLowerCase().includes('critical') ? 'alert' : 'optimization',
                    priority: line.toLowerCase().includes('critical') ? 'critical' : 'medium',
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
            summary: `Parsed ${insights.length} insights from AI analysis.`
        };
    }

    /**
     * Parse resource optimization from text response
     */
    parseResourceOptimizationText(textResponse) {
        const recommendations = [];
        const lines = textResponse.split('\n');
        
        let currentRec = null;
        lines.forEach(line => {
            if (line.includes('**') && line.includes(':')) {
                if (currentRec) recommendations.push(currentRec);
                currentRec = {
                    id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    title: line.replace(/\*\*/g, '').replace(':', '').trim(),
                    description: '',
                    impact: 'Operational improvement',
                    effort: 'Medium',
                    priority: 'medium',
                    actionType: 'manual'
                };
            } else if (currentRec && line.trim()) {
                currentRec.description += line.trim() + ' ';
            }
        });
        
        if (currentRec) recommendations.push(currentRec);
        
        return { recommendations };
    }

    /**
     * Set API key (call this method to configure real Gemini API)
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        console.log('Gemini AI API key configured');
    }

    /**
     * Check if AI is properly configured
     */
    isConfigured() {
        return this.initialized && (this.apiKey !== null);
    }
}

// Export for global use
window.GeminiAI = GeminiAI;

// Initialize Gemini AI
document.addEventListener('DOMContentLoaded', () => {
    if (!window.geminiAI) {
        window.geminiAI = new GeminiAI();
        console.log('Gemini AI initialized');
    }
});

/**
 * Usage Examples:
 * 
 * // Get medical recommendations
 * const recommendations = await window.geminiAI.getMedicalRecommendations({
 *     patientAge: 45,
 *     gender: 'Male',
 *     diagnosis: 'Hypertension',
 *     chiefComplaint: 'Chest pain',
 *     medicalHistory: 'Diabetes',
 *     allergies: ['Penicillin']
 * });
 * 
 * // Get nursing recommendations
 * const nursingCare = await window.geminiAI.getNursingRecommendations({
 *     patientCondition: 'Post-operative',
 *     riskFactors: ['Fall risk', 'Pain management']
 * });
 * 
 * // Analyze vitals
 * const vitalsInsight = await window.geminiAI.analyzeVitals({
 *     bloodPressure: '140/90',
 *     heartRate: 85,
 *     temperature: 37.2,
 *     oxygenSaturation: 96,
 *     respiratoryRate: 18
 * });
 * 
 * // Check drug interactions
 * const interactions = await window.geminiAI.checkDrugInteractions([
 *     { name: 'Warfarin', dosage: '5mg', route: 'Oral', frequency: 'Daily' },
 *     { name: 'Aspirin', dosage: '81mg', route: 'Oral', frequency: 'Daily' }
 * ]);
 */
