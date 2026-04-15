/**
 * ResolutionEngine.js
 * Generates corrective prompts for creating hallucination-free slides.
 */

export function generateFixPrompt(results) {
  const issues = results.filter(r => r.verdict === 'hallucinated' || r.verdict === 'uncertain');
  
  if (issues.length === 0) {
    return "No significant hallucinations detected. The current slides are consistent with source materials.";
  }

  let prompt = "Please update the slide deck based on the following forensic corrections:\n\n";

  issues.forEach((issue, idx) => {
    prompt += `${idx + 1}. [SLIDE ${issue.slide || 'N/A'}] ISSUE: "${issue.text}"\n`;
    prompt += `   CORRECTION: Use the following source evidence: "${issue.source_match}"\n`;
    prompt += `   REASONING: ${issue.reasoning}\n\n`;
  });

  prompt += "GOAL: Re-generate these slides ensuring all figures, claims, and data points align strictly with the corrected evidence provided above.";
  
  return prompt;
}
