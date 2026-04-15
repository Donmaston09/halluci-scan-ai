import React, { useState, useRef, useEffect } from 'react';
import { 
  ShieldCheck, 
  Settings, 
  LayoutDashboard, 
  History, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  BarChart3,
  Loader2,
  Info,
  Flag,
  Upload,
  FileText,
  Search,
  Heart
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { runFullAudit, GEMINI_MODELS } from './FactCheckEngine';
import { runHeuristicAudit } from './HeuristicEngine';
import { extractTextFromPdf } from './PdfExtractor';
import { extractTextFromPptx } from './PptxExtractor';
import { generateFixPrompt } from './ResolutionEngine';

// --- Sub-components ---

const ProgressBar = ({ progress, label }) => (
  <div style={{ width: '100%', marginTop: '1rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
      <span>{label}</span>
      <span>{progress}%</span>
    </div>
    <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '10px', overflow: 'hidden' }}>
      <motion.div 
        style={{ height: '100%', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))' }}
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5 }}
      />
    </div>
  </div>
);

const MetricCard = ({ label, value, type, icon: Icon }) => (
  <div className="glass" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
    <div style={{ padding: '0.75rem', borderRadius: '12px', background: `rgba(var(--accent-${type}-rgb, 139, 92, 246), 0.1)`, color: `var(--accent-${type})` }}>
      <Icon size={24} />
    </div>
    <div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', tracking: '0.1em' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'var(--font-heading)' }}>{value}</div>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('halluci_key') || '');
  const [slidesText, setSlidesText] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [phase, setPhase] = useState('setup'); // setup | auditing | results
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState('');
  const [modelId, setModelId] = useState(localStorage.getItem('halluci_model') || GEMINI_MODELS[0].id);
  const [slidesBase64, setSlidesBase64] = useState(null);
  const [slidesMime, setSlidesMime] = useState('');
  const [showResolution, setShowResolution] = useState(false);
  const [userVerdicts, setUserVerdicts] = useState({}); // Tracking which IDs have been human-verified

  const slideRef = useRef();
  const sourceRef = useRef();

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsExtracting(true);
    setExtractStatus("Initializing extraction...");
    try {
      let text = "";
      const extension = file.name.split('.').pop().toLowerCase();

      if (extension === "pdf") {
        text = await extractTextFromPdf(file);
      } else if (extension === "pptx") {
        text = await extractTextFromPptx(file, (status) => setExtractStatus(status));
      } else {
        text = await file.text();
      }
      
      if (type === 'slides') {
        setSlidesText(text);
        setSlidesMime(file.type);
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          setSlidesBase64(base64);
        };
        reader.readAsDataURL(file);
      } else {
        setSourceText(text);
      }
      setExtractStatus("");
    } catch (err) {
      alert("Failed to extract text: " + err.message);
      setExtractStatus("");
    } finally {
      setIsExtracting(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('halluci_key', apiKey);
    localStorage.setItem('halluci_model', modelId);
  }, [apiKey, modelId]);

  const handleAudit = async () => {
    if (!slidesText || !sourceText) return;
    setPhase('auditing');
    
    try {
      let data;
      if (!apiKey) {
        data = await runHeuristicAudit(slidesText, sourceText, (label, prog) => {
          setProgressLabel(label);
          setProgress(prog);
        });
      } else {
        data = await runFullAudit(apiKey, modelId, slidesText, sourceText, slidesBase64, slidesMime, (label, prog) => {
          setProgressLabel(label);
          setProgress(prog);
        });
      }
      setResults(data);
      setUserVerdicts({}); // Reset user edits for new audit
      setPhase('results');
      if (data.length > 0) setSelectedId(data[0].id);
    } catch (err) {
      alert(err.message);
      setPhase('setup');
    }
  };

  const handleUpdateVerdict = (id, newVerdict) => {
    setResults(prev => prev.map(r => 
      r.id === id ? { ...r, verdict: newVerdict, confidence: 100 } : r
    ));
    setUserVerdicts(prev => ({ ...prev, [id]: true }));
  };

  const allVerified = results.length > 0 && Object.keys(userVerdicts).length === results.length;

  const stats = {
    total: results.length,
    hallucinated: results.filter(r => r.verdict === 'hallucinated').length,
    uncertain: results.filter(r => r.verdict === 'uncertain').length,
    verified: results.filter(r => r.verdict === 'verified').length,
    avgConfidence: allVerified 
      ? Math.round(results.reduce((acc, r) => acc + r.confidence, 0) / results.length) 
      : "Pending Review"
  };

  const selectedClaim = results.find(r => r.id === selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header className="glass" style={{ height: '70px', borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, display: 'flex', alignItems: 'center', padding: '0 2rem', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck color="white" size={24} />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>HalluciScan <span style={{ color: 'var(--accent-primary)', opacity: 0.8 }}>AI</span></h1>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500', marginLeft: '0.5rem' }}>by Onoja</span>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a 
            href="https://paypal.me/Onoja412" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ 
              fontSize: '11px', 
              fontWeight: '700', 
              color: 'var(--accent-primary)', 
              textDecoration: 'none',
              padding: '6px 12px',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '20px',
              background: 'rgba(139, 92, 246, 0.05)'
            }}
          >
            SUPPORT
          </a>

          {phase === 'results' && (
            <>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div className="badge badge-hallucinated">{results.filter(r => r.verdict === 'hallucinated').length} Hallucinated</div>
                <div className="badge badge-uncertain">{results.filter(r => r.verdict === 'uncertain').length} Uncertain</div>
                <div className="badge badge-verified">{results.filter(r => r.verdict === 'verified').length} Verified</div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  className="btn-primary" 
                  style={{ padding: '0.4rem 1rem', fontSize: '11px', width: 'auto' }}
                  onClick={() => setShowResolution(true)}
                >
                  Generate Fix Prompt
                </button>
                <button 
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}
                  onClick={() => setPhase('setup')}
                >
                  <History size={20} />
                </button>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><Settings size={20} /></button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        <AnimatePresence mode="wait">
          
          {phase === 'setup' && (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="setup-container"
            >
              <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h2 style={{ fontSize: '3rem', marginBottom: '1rem' }}>Truth in every slide.</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.25rem' }}>Professional hallucination auditing for high-stakes presentations.</p>
              </div>

              <div className="glass" style={{ padding: '2.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                  <div className="input-group">
                    <label>API Configuration</label>
                    <input 
                      type="password"
                      placeholder="Gemini API Key..."
                      className="input-main"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <label>Intelligence Tier</label>
                    <select 
                      className="input-main"
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      style={{ cursor: 'pointer' }}
                    >
                      {GEMINI_MODELS.map(m => (
                        <option key={m.id} value={m.id} style={{ background: 'var(--bg-secondary)' }}>
                          {m.name} — {m.speed}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                  <div className="input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label style={{ marginBottom: 0 }}>Slide Content (Text/PDF)</label>
                      <button 
                        onClick={() => slideRef.current.click()}
                        disabled={isExtracting}
                        style={{ background: 'none', border: 'none', color: isExtracting ? 'var(--text-muted)' : 'var(--accent-primary)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {isExtracting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} 
                        {isExtracting ? 'EXTRACTING...' : 'UPLOAD'}
                      </button>
                    </div>
                    <input type="file" ref={slideRef} hidden accept=".pdf,.pptx,.txt,.md" onChange={(e) => handleFileUpload(e, 'slides')} />
                    <textarea 
                      placeholder={isExtracting ? (extractStatus || "Extracting text...") : "Paste text or upload PDF/PPTX..."}
                      className="input-main"
                      style={{ height: '200px', resize: 'none', opacity: isExtracting ? 0.6 : 1 }}
                      value={slidesText}
                      readOnly={isExtracting}
                      onChange={(e) => setSlidesText(e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label style={{ marginBottom: 0 }}>Source Materials</label>
                      <button 
                        onClick={() => sourceRef.current.click()}
                        disabled={isExtracting}
                        style={{ background: 'none', border: 'none', color: isExtracting ? 'var(--text-muted)' : 'var(--accent-primary)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {isExtracting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} 
                        {isExtracting ? 'EXTRACTING...' : 'UPLOAD'}
                      </button>
                    </div>
                    <input type="file" ref={sourceRef} hidden accept=".pdf,.txt,.md" onChange={(e) => handleFileUpload(e, 'source')} />
                    <textarea 
                      placeholder={isExtracting ? "Extracting text from PDF..." : "Paste text or upload source PDF..."}
                      className="input-main"
                      style={{ height: '200px', resize: 'none', opacity: isExtracting ? 0.6 : 1 }}
                      value={sourceText}
                      readOnly={isExtracting}
                      onChange={(e) => setSourceText(e.target.value)}
                    />
                  </div>
                </div>

                <button 
                  className="btn-primary" 
                  onClick={handleAudit}
                  disabled={!slidesText || !sourceText || isExtracting}
                  style={{ background: !apiKey ? 'linear-gradient(135deg, #6366f1, #a855f7)' : '' }}
                >
                  {isExtracting ? 'Extracting File Content...' : (!apiKey ? 'Start Local Forensic Audit' : 'Start AI Forensic Audit')}
                </button>
                {!apiKey && (
                  <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '1rem' }}>
                    <Info size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                    No API Key detected. Running in <strong>Local Semantic Mode</strong> (Zero Cost).
                  </p>
                )}
              </div>

              {/* Creator Credit Footer */}
              <div style={{ marginTop: '4rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Created with <Heart size={14} fill="var(--accent-secondary)" color="var(--accent-secondary)" /> by <strong style={{ color: 'var(--text-primary)' }}>Onoja</strong>
                </div>
                <a 
                  href="https://paypal.me/Onoja412" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="glass"
                  style={{ 
                    padding: '8px 16px', 
                    fontSize: '11px', 
                    fontWeight: '700', 
                    color: 'var(--accent-primary)', 
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: '1px solid rgba(139, 92, 246, 0.3)'
                  }}
                >
                  SUPPORT PROJECT
                </a>
              </div>
            </motion.div>
          )}

          {phase === 'auditing' && (
            <motion.div 
              key="auditing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ maxWidth: '400px', margin: '10rem auto', textAlign: 'center' }}
            >
              <Loader2 className="animate-spin" style={{ color: 'var(--accent-primary)', marginBottom: '2rem' }} size={48} />
              <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Analyzing Evidence</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Extracting claims and cross-referencing with source materials...</p>
              <ProgressBar progress={progress} label={progressLabel} />
            </motion.div>
          )}

          {phase === 'results' && (
            <motion.div 
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <div className="metrics-grid">
                <MetricCard label="Claims Audited" value={stats.total} type="primary" icon={BarChart3} />
                <MetricCard label="Hallucinated" value={stats.hallucinated} type="danger" icon={XCircle} />
                <MetricCard label="Uncertain" value={stats.uncertain} type="warning" icon={AlertTriangle} />
                <MetricCard label="Avg Confidence" value={`${stats.avgConfidence}%`} type="success" icon={CheckCircle2} />
              </div>

              <div className="audit-layout">
                {/* Claims List */}
                <div className="claims-list">
                  <div style={{ padding: '0 0.5rem 0.5rem', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Extracted Claims
                  </div>
                  {results.map(claim => (
                    <button 
                      key={claim.id}
                      className={`claim-card ${selectedId === claim.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(claim.id)}
                    >
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                         <div style={{ marginTop: '0.25rem', width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: `var(--accent-${claim.verdict === 'verified' ? 'success' : claim.verdict === 'hallucinated' ? 'danger' : 'warning'})` }} />
                         <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                           {claim.text}
                         </div>
                      </div>
                      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>
                        <span>Slide {claim.slide}</span>
                        <span>{claim.type}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Review Panel */}
                <div style={{ overflowY: 'auto' }}>
                  {selectedClaim ? (
                    <motion.div 
                      key={selectedId}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="glass review-panel"
                      style={{ padding: '2.5rem' }}
                    >
                      <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                          <div className={`badge badge-${selectedClaim.verdict}`}>
                            {selectedClaim.verdict} Verdict
                          </div>
                          <div style={{ display: 'flex', gap: '1rem' }}>
                             <div style={{ textAlign: 'right' }}>
                               <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>CONFIDENCE</div>
                               <div style={{ fontSize: '18px', fontWeight: '800' }}>{selectedClaim.confidence}%</div>
                             </div>
                          </div>
                        </div>
                        <h2 style={{ fontSize: '2rem', lineHeight: '1.4', marginBottom: '0' }}>{selectedClaim.text}</h2>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            <Info size={14} /> SLIDE VERBATIM
                          </label>
                          <div style={{ padding: '1.5rem', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            "{selectedClaim.rawText}"
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            <Search size={14} /> SOURCE EVIDENCE
                          </label>
                          <div style={{ padding: '1.5rem', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '12px', border: '1px dotted var(--accent-primary)', fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                            {selectedClaim.source_match}
                          </div>
                        </div>
                      </div>

                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            <History size={14} /> {selectedClaim.isHeuristic ? 'HEURISTIC CONSISTENCY' : 'AI AUDIT REASONING'}
                          </label>
                          <div style={{ padding: '1.5rem', background: 'var(--bg-tertiary)', borderRadius: '16px', fontSize: '15px', lineHeight: '1.8' }}>
                            {selectedClaim.reasoning}
                          </div>
                        </div>

                        {selectedClaim.isHeuristic && selectedClaim.topMatches && (
                          <div style={{ marginTop: '2rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                              <BarChart3 size={14} /> EVIDENCE HEATMAP (RELEVANT CLUSTERS)
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {selectedClaim.topMatches.map((match, idx) => (
                                <div key={idx} style={{ 
                                  padding: '1rem', 
                                  background: idx === 0 ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255, 255, 255, 0.02)', 
                                  border: `1px solid ${idx === 0 ? 'var(--accent-success)' : 'var(--border-subtle)'}`,
                                  borderRadius: '8px', 
                                  fontSize: '12px', 
                                  color: 'var(--text-secondary)'
                                }}>
                                  <span style={{ fontWeight: '700', marginRight: '8px', opacity: 0.5 }}>Cluster {idx + 1}</span>
                                  {match}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {selectedClaim.bias_flags?.length > 0 && (
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            <Flag size={14} /> DETECTED BIASES
                          </label>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                             {selectedClaim.bias_flags.map(flag => (
                               <span key={flag} style={{ padding: '4px 12px', borderRadius: '20px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>
                                 {flag.replace('_', ' ')}
                               </span>
                             ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '1rem', paddingTop: '1rem' }}>
                         <button 
                            className="btn-primary" 
                            style={{ flex: 1, background: 'var(--accent-success)' }}
                            onClick={() => handleUpdateVerdict(selectedId, 'verified')}
                          >
                            Verify Claim
                          </button>
                         <button 
                            className="btn-primary" 
                            style={{ flex: 1, background: 'var(--accent-danger)' }}
                            onClick={() => handleUpdateVerdict(selectedId, 'hallucinated')}
                          >
                            Flag as Error
                          </button>
                         <button 
                            className="btn-primary" 
                            style={{ flex: 1, background: 'var(--accent-warning)', color: 'white' }}
                            onClick={() => handleUpdateVerdict(selectedId, 'uncertain')}
                          >
                            Mark Uncertain
                          </button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="glass" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center' }}>
                      <LayoutDashboard size={64} style={{ opacity: 0.1, marginBottom: '2rem' }} />
                      <h4 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Audit Terminal</h4>
                      <p>Select a claim from the left panel to begin forensic verification.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Minimalist Results Footer */}
              <div style={{ padding: '1rem 0', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
                <span>Created by Onoja</span>
                <span style={{ opacity: 0.3 }}>|</span>
                <a href="https://paypal.me/Onoja412" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: '600' }}>Support Development</a>
              </div>
            </motion.div>
          )}

          {showResolution && (
            <motion.div 
               style={{ 
                 position: 'fixed', bottom: 0, left: 0, right: 0, top: 0, 
                 zIndex: 1000, background: 'rgba(0,0,0,0.8)', padding: '4rem 2rem',
                 display: 'flex', justifyContent: 'center'
               }}
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
            >
              <div className="glass" style={{ width: '100%', maxWidth: '800px', padding: '3rem', position: 'relative' }}>
                <button 
                  onClick={() => setShowResolution(false)}
                  style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', color: 'var(--text-muted)' }}
                >
                  <XCircle size={24} />
                </button>
                <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>Corrective Slide Instruction</h2>
                <div style={{ padding: '1.5rem', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: '14px', whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto' }}>
                  {generateFixPrompt(results)}
                </div>
                <button 
                   className="btn-primary" 
                   style={{ marginTop: '2rem' }}
                   onClick={() => {
                     navigator.clipboard.writeText(generateFixPrompt(results));
                     alert("Copied to clipboard!");
                   }}
                >
                   Copy Perfect Slide Prompt
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
