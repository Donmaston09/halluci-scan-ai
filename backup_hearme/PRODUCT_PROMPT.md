# Rewritten Build Prompt

Build a Streamlit web app called **Human-in-the-Loop Slide Error Finder** for auditing AI-generated slide decks, especially NotebookLM outputs, against original source materials in high-stakes domains such as medicine, healthcare, and finance.

The app should:

- Let users upload generated slides and supporting source files.
- Extract slide-level text from common formats such as PDF, PPTX, DOCX, TXT, and Markdown.
- Compare each slide claim against the source corpus to identify likely hallucinations, weakly supported statements, and numeric inconsistencies.
- Quantify confidence and uncertainty for every slide and every extracted claim.
- Produce an explainable audit trail that shows the strongest matching source evidence for each flagged claim.
- Present the results with an executive summary, visual plots, slide-level risk rankings, and a detailed review interface that helps a human quickly validate or correct misinformation.

The first prototype can focus on text-based auditing, while clearly signaling that image-only slides and figure verification will require OCR and multimodal vision in a later version.
