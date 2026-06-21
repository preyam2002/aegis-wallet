"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { buildSafetyDemoScenarios } from "../lib/safety-demo";
import { formatMist } from "../lib/transaction-analysis";

export const SafetyDemoPanel = () => {
	const scenarios = buildSafetyDemoScenarios();

	return (
		<section className="safetyDemoPanel">
			<div className="sectionHeader">
				<span>
					<ShieldCheck size={16} /> See it block a drain
				</span>
				<strong>4</strong>
			</div>
			<p className="panelLead">
				Read-only attack previews. No funds move; these are the same scanner
				paths used before signing.
			</p>
			<div className="demoScenarioGrid">
				{scenarios.map((scenario) => {
					const finding = scenario.analysis.findings[0];
					return (
						<div className="demoScenario" key={scenario.title}>
							<div className={`riskPill ${scenario.analysis.riskLevel}`}>
								<AlertTriangle size={15} />
								{scenario.analysis.riskLevel}
							</div>
							<strong>{scenario.title}</strong>
							<span>{scenario.description}</span>
							<em>{finding?.title ?? scenario.analysis.summary}</em>
							<small>
								{formatMist(scenario.analysis.netMist)} ·{" "}
								{scenario.analysis.netObjects.length} objects leaving
							</small>
						</div>
					);
				})}
			</div>
		</section>
	);
};
