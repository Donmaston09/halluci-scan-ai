import JSZip from 'jszip';
import Tesseract from 'tesseract.js';

/**
 * Extracts all text from a PPTX file.
 * Fallback to OCR if no text is found in XML.
 */
export async function extractTextFromPptx(file, onProgress = () => {}) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slides = [];

  // 1. Identify all slide files and sort them numerically
  const slideFiles = Object.keys(zip.files)
    .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)[1]);
      const numB = parseInt(b.match(/slide(\d+)\.xml/)[1]);
      return numA - numB;
    });

  const parser = new DOMParser();

  // 2. Iterate through each slide
  for (const [index, fileName] of slideFiles.entries()) {
    onProgress(`Processing Slide ${index + 1} of ${slideFiles.length}...`);
    
    const xmlText = await zip.file(fileName).async('text');
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    
    // Attempt XML text extraction first
    const textNodes = xmlDoc.getElementsByTagName('a:t');
    let slideText = Array.from(textNodes)
      .map(node => node.textContent)
      .filter(t => t.trim().length > 0)
      .join(' ')
      .replace(/\s+/g, ' ');

    // 3. OCR Fallback if no text found
    if (!slideText || slideText.trim().length < 5) {
      onProgress(`Running OCR on Slide ${index + 1}...`);
      
      // Look for images associated with this slide
      // Relationship file is in ppt/slides/_rels/slideN.xml.rels
      const relFileName = `ppt/slides/_rels/${fileName.split('/').pop()}.rels`;
      const relFile = zip.file(relFileName);
      
      if (relFile) {
        const relXml = await relFile.async('text');
        const relDoc = parser.parseFromString(relXml, 'application/xml');
        const rels = Array.from(relDoc.getElementsByTagName('Relationship'));
        
        // Find image relationships
        const imgRels = rels.filter(r => r.getAttribute('Type').includes('/image'));
        
        if (imgRels.length > 0) {
          // Extract the largest image (usually the slide background/content)
          // For simplicity, we'll try the first image or the one that looks like a slide capture
          let combinedOcrText = '';
          
          for (const rel of imgRels) {
            const target = rel.getAttribute('Target');
            // Path is relative to ppt/slides/, so ../media/image1.png -> ppt/media/image1.png
            const imgPath = target.startsWith('..') ? target.replace('..', 'ppt') : `ppt/slides/${target}`;
            const imgFile = zip.file(imgPath);
            
            if (imgFile) {
              const imgBlob = await imgFile.async('blob');
              const { data: { text } } = await Tesseract.recognize(imgBlob, 'eng');
              combinedOcrText += text + ' ';
            }
          }
          slideText = `[OCR Extract] ${combinedOcrText.trim()}`;
        }
      }
    }

    if (slideText) {
      slides.push(`--- Slide ${index + 1} ---\n${slideText}`);
    }
  }

  if (slides.length === 0) {
    throw new Error("No readable text found in the PPTX file (tried XML and OCR).");
  }

  return slides.join('\n\n');
}
