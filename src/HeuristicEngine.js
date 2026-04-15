/**
 * HeuristicEngine.js
 * Professor's "Local Mini-RAG" - Unsupervised Semantic Auditing in the Browser.
 */

class MiniRAG {
  constructor() {
    this.documents = []; // Array of { original, tokens, vector }
    this.allTokens = new Set();
    this.idf = {};
  }

  tokenize(text) {
    return text.toLowerCase()
      .replace(/[^\w\s\d]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  index(sourceText) {
    // Split into sentences or small chunks (paragraphs) as "documents"
    const chunks = sourceText.split(/[.\n!?;]/).filter(c => c.trim().length > 10);
    this.documents = chunks.map(c => ({
      original: c.trim(),
      tokens: this.tokenize(c)
    }));

    // Build DF (Document Frequency)
    const df = {};
    this.documents.forEach(doc => {
      const uniqueTokens = new Set(doc.tokens);
      uniqueTokens.forEach(t => {
        df[t] = (df[t] || 0) + 1;
        this.allTokens.add(t);
      });
    });

    // Calculate IDF
    const N = this.documents.length;
    Object.keys(df).forEach(t => {
      this.idf[t] = Math.log(N / df[t]);
    });

    // Build TF-IDF vectors for documents
    this.documents.forEach(doc => {
      doc.vector = this.getVector(doc.tokens);
    });
  }

  getVector(tokens) {
    const tf = {};
    tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);
    
    const vector = {};
    Object.keys(tf).forEach(t => {
      if (this.idf[t]) {
        vector[t] = tf[t] * this.idf[t];
      }
    });
    return vector;
  }

  cosineSimilarity(v1, v2) {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    const keys = new Set([...Object.keys(v1), ...Object.keys(v2)]);
    keys.forEach(k => {
      const val1 = v1[k] || 0;
      const val2 = v2[k] || 0;
      dotProduct += val1 * val2;
      mag1 += val1 * val1;
      mag2 += val2 * val2;
    });

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
  }

  search(query, limit = 3) {
    const queryVector = this.getVector(this.tokenize(query));
    const results = this.documents.map(doc => ({
      ...doc,
      score: this.cosineSimilarity(queryVector, doc.vector)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    return results;
  }
}

/**
 * Main Heuristic Auditing Function
 */
export async function runHeuristicAudit(slidesText, sourceText, onProgress) {
  onProgress("Initializing Mini-RAG...", 10);
  const rag = new MiniRAG();
  rag.index(sourceText);

  onProgress("Extracting Claims...", 30);
  // Split slides into claims (bullets, periods, newlines)
  const claimsRaw = slidesText.split(/[•\n\.-]/)
    .map(c => c.trim())
    .filter(c => c.length > 15); // Only long enough sentences

  const results = [];
  
  onProgress(`Analyzing ${claimsRaw.length} claims...`, 50);

  for (let i = 0; i < claimsRaw.length; i++) {
    const claim = claimsRaw[i];
    const topMatches = rag.search(claim);
    const bestMatch = topMatches[0];

    // --- Numeric Verification (Professor's Guardrail) ---
    const numbersInClaim = claim.match(/-?\d+(\.\d+)?%?/g) || [];
    let numericHallucination = false;
    let missingNumber = null;

    if (numbersInClaim.length > 0) {
      // Numbers must exist SOMEWHERE in the source, or at least in the best match
      for (const num of numbersInClaim) {
        if (!sourceText.includes(num)) {
          numericHallucination = true;
          missingNumber = num;
          break;
        }
      }
    }

    // --- Reliability Scoring ---
    const lexicalScore = bestMatch ? bestMatch.score * 100 : 0;
    let verdict = 'verified';
    let confidence = lexicalScore;

    if (lexicalScore < 25) {
      verdict = 'hallucinated';
    } else if (lexicalScore < 50 || numericHallucination) {
      verdict = numericHallucination ? 'hallucinated' : 'uncertain';
    }

    results.push({
      id: i + 1,
      slide: "H", // Heuristic slide tag
      text: claim,
      type: "heuristic_claim",
      rawText: claim,
      verdict,
      confidence: Math.round(confidence),
      source_match: bestMatch ? bestMatch.original : "No relevant evidence cluster found.",
      reasoning: numericHallucination 
        ? `Numeric Hallucination: The figure "${missingNumber}" is present in the slide but was not found in the source documents.` 
        : `Heuristic Matching: This claim has a semantic consistency score of ${Math.round(lexicalScore)}% with the most relevant source paragraph.`,
      bias_flags: numericHallucination ? ["numeric_mismatch"] : [],
      isHeuristic: true,
      topMatches: topMatches.map(m => m.original) // For the Heatmap UI
    });

    onProgress(`Analyzing claims...`, Math.round(50 + (i / claimsRaw.length) * 40));
  }

  onProgress("Forensics Complete", 100);
  return results;
}
