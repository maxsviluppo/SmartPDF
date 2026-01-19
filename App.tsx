
import React, { useState, useRef, useEffect } from 'react';
import { analyzeDocument, prefillDocument } from './services/geminiService';
import { FormField, AppState, PageData, PDFPageThumbnail } from './types';
import { 
  FileUp, 
  Loader2, 
  Printer, 
  RefreshCw, 
  FileText,
  AlertCircle,
  Sparkles,
  ArrowLeft,
  CheckSquare,
  Square,
  Layers,
  Settings,
  Layout,
  Check,
  Eye,
  Edit3,
  X
} from 'lucide-react';

// --- Global PDF.js Setup ---
const pdfjsLib = (window as any).pdfjsLib;
// Usiamo la stessa versione definita nell'index.html
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [pdfPages, setPdfPages] = useState<PDFPageThumbnail[]>([]);
  const [pagesData, setPagesData] = useState<PageData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  
  // Opzioni di Stampa & Anteprima
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [selectedPrintPages, setSelectedPrintPages] = useState<number[]>([]);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfDocRef = useRef<any>(null);

  // Sincronizza le pagine selezionate per la stampa
  useEffect(() => {
    if (pagesData.length > 0) {
      setSelectedPrintPages(pagesData.map(p => p.pageNumber));
    }
  }, [pagesData]);

  const generateThumbnails = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    pdfDocRef.current = pdf;
    
    const thumbnails: PDFPageThumbnail[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.3 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context!, viewport }).promise;
      thumbnails.push({
        pageNumber: i,
        thumbnail: canvas.toDataURL('image/jpeg', 0.6),
        selected: i === 1
      });
    }
    setPdfPages(thumbnails);
    setAppState(AppState.SELECTING_PAGES);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      setError("Per favore carica un file PDF valido.");
      return;
    }
    try {
      setError(null);
      await generateThumbnails(file);
    } catch (err: any) {
      setError("Errore nel caricamento del PDF.");
    }
  };

  const togglePageSelection = (pageNumber: number) => {
    setPdfPages(prev => prev.map(p => 
      p.pageNumber === pageNumber ? { ...p, selected: !p.selected } : p
    ));
  };

  const processSelectedPages = async () => {
    const selected = pdfPages.filter(p => p.selected);
    if (selected.length === 0) {
      setError("Seleziona almeno una pagina da convertire.");
      return;
    }

    setAppState(AppState.PROCESSING);
    setLoadingProgress({ current: 0, total: selected.length });
    
    const processedPages: PageData[] = [];
    
    try {
      for (const [index, pageThumb] of selected.entries()) {
        setLoadingProgress({ current: index + 1, total: selected.length });
        const page = await pdfDocRef.current.getPage(pageThumb.pageNumber);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context!, viewport }).promise;
        const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        
        const analysis = await analyzeDocument(b64);
        processedPages.push({
          pageNumber: pageThumb.pageNumber,
          image: `data:image/jpeg;base64,${b64}`,
          fields: analysis.fields,
          title: analysis.title
        });
      }
      setPagesData(processedPages);
      setAppState(AppState.EDITING);
    } catch (err: any) {
      setError("Errore durante l'analisi.");
      setAppState(AppState.SELECTING_PAGES);
    }
  };

  const updateFieldValue = (pageIndex: number, fieldId: string, value: string | boolean) => {
    setPagesData(prev => prev.map((page, idx) => {
      if (idx !== pageIndex) return page;
      return {
        ...page,
        fields: page.fields.map(f => f.id === fieldId ? { ...f, value } : f)
      };
    }));
  };

  const handleSmartPrefill = async () => {
    setIsPrefilling(true);
    try {
      const updatedPages = [...pagesData];
      for (let i = 0; i < updatedPages.length; i++) {
        const page = updatedPages[i];
        const suggestions = await prefillDocument(page.title, page.fields);
        updatedPages[i] = {
          ...page,
          fields: page.fields.map(field => {
            const suggestion = suggestions[field.label];
            return suggestion !== undefined ? { ...field, value: suggestion } : field;
          })
        };
      }
      setPagesData(updatedPages);
    } catch (err) {
      console.error("Prefill failed", err);
    } finally {
      setIsPrefilling(false);
    }
  };

  const togglePrintPage = (pageNumber: number) => {
    setSelectedPrintPages(prev => 
      prev.includes(pageNumber) 
        ? prev.filter(p => p !== pageNumber) 
        : [...prev, pageNumber]
    );
  };

  const handlePrint = () => {
    if (selectedPrintPages.length === 0) {
      alert("Seleziona almeno una pagina da stampare.");
      return;
    }
    // Assicuriamoci che l'orientamento sia applicato prima della stampa
    window.print();
  };

  const reset = () => {
    setAppState(AppState.IDLE);
    setPdfPages([]);
    setPagesData([]);
    setSelectedPrintPages([]);
    setIsPreviewMode(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* CSS Critico per risolvere il problema della stampa bianca */}
      <style>{`
        @page {
          size: ${printOrientation};
          margin: 0;
        }
        @media print {
          /* Reset degli stili globali per la stampa */
          html, body {
            height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          /* Nascondi tutto tranne l'area stampabile */
          #root > div > header,
          #root > div > main > aside,
          #root > div > main > .flex-1 > nav,
          .no-print {
            display: none !important;
          }
          /* Il main deve espandersi */
          main {
            display: block !important;
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          /* Il contenitore scrollabile deve diventare visibile */
          .scroll-container {
            display: block !important;
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
          }
          #printable-root {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Ogni pagina di stampa */
          .print-page {
            display: flex !important;
            flex-direction: column !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            width: 100% !important;
            min-height: 100vh !important;
            padding: 2cm !important; /* Margine interno per stampanti */
            box-sizing: border-box !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          /* Forza il layout a griglia */
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(${printOrientation === 'portrait' ? 2 : 3}, 1fr) !important;
          }
        }
      `}</style>

      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-40 flex items-center justify-between no-print shadow-sm">
        <div className="flex items-center gap-2">
          {appState !== AppState.IDLE ? (
            <button onClick={reset} className="p-2 hover:bg-slate-100 rounded-full transition-colors mr-2">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
          ) : (
            <div className="bg-blue-600 p-2 rounded-lg">
              <FileText className="text-white w-6 h-6" />
            </div>
          )}
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            SmartPDF Editor
          </h1>
        </div>
        
        {appState === AppState.EDITING && (
          <div className="flex items-center gap-2">
             <button 
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium ${isPreviewMode ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {isPreviewMode ? <Edit3 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="hidden sm:inline">{isPreviewMode ? 'Torna all\'Editor' : 'Anteprima di Stampa'}</span>
            </button>
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg transition-all font-medium shadow-md hover:bg-blue-700 active:scale-95">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Stampa / PDF</span>
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {appState === AppState.IDLE && (
          <div className="flex-1 max-w-4xl mx-auto px-6 py-12 md:py-20 flex flex-col items-center text-center overflow-y-auto">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
              <FileUp className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Modifica i tuoi PDF</h2>
            <p className="text-slate-500 text-lg mb-10 max-w-2xl">
              Trasforma documenti statici in moduli editabili. Compila, automatizza con l'IA e stampa.
            </p>
            <div onClick={() => fileInputRef.current?.click()} className="group relative cursor-pointer border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white p-12 rounded-2xl transition-all w-full max-w-lg shadow-sm hover:shadow-md">
              <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={handleFileUpload} />
              <div className="flex flex-col items-center">
                <FileUp className="w-12 h-12 text-slate-400 group-hover:text-blue-500 mb-4 transition-colors" />
                <span className="text-slate-900 font-semibold text-lg mb-1">Carica PDF</span>
                <span className="text-slate-500 text-sm">Clicca per selezionare un file</span>
              </div>
            </div>
          </div>
        )}

        {appState === AppState.SELECTING_PAGES && (
          <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
            <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Seleziona pagine</h2>
                <p className="text-slate-500 text-sm">Quali pagine vuoi rendere compilabili?</p>
              </div>
              <button 
                onClick={processSelectedPages}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg active:scale-95"
              >
                <Layers className="w-5 h-5" />
                Apri Editor ({pdfPages.filter(p => p.selected).length})
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {pdfPages.map((page) => (
                  <div 
                    key={page.pageNumber}
                    onClick={() => togglePageSelection(page.pageNumber)}
                    className={`relative cursor-pointer rounded-xl border-2 transition-all p-2 group ${page.selected ? 'border-blue-500 bg-blue-50 shadow-lg' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="absolute top-4 right-4 z-10">
                      {page.selected ? (
                        <CheckSquare className="w-6 h-6 text-blue-600 fill-white" />
                      ) : (
                        <Square className="w-6 h-6 text-slate-300 group-hover:text-slate-400" />
                      )}
                    </div>
                    <img src={page.thumbnail} className="w-full h-auto rounded-lg shadow-sm" alt={`Pagina ${page.pageNumber}`} />
                    <div className="mt-3 text-center text-sm font-bold text-slate-600">Pagina {page.pageNumber}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {appState === AppState.PROCESSING && (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50">
            <div className="bg-white p-10 rounded-3xl shadow-xl flex flex-col items-center gap-6 max-w-md w-full border border-slate-100">
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
              <div className="text-center">
                <h3 className="text-xl font-bold mb-2">L'IA sta leggendo il documento...</h3>
                <p className="text-slate-500">Analisi pagina {loadingProgress.current} di {loadingProgress.total}</p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-600 h-full transition-all duration-500" 
                  style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {appState === AppState.EDITING && (
          <>
            {/* Pannello Dati (Template originale) */}
            <aside className={`w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col no-print z-20 shadow-sm transition-all duration-300 ${isPreviewMode ? '-translate-x-full absolute opacity-0' : 'translate-x-0 relative'}`}>
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Moduli Trovati</h3>
                <button 
                  onClick={handleSmartPrefill}
                  disabled={isPrefilling}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 disabled:opacity-50"
                >
                  {isPrefilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Compila con IA
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-container no-print">
                {pagesData.map((page, pIdx) => (
                  <div key={pIdx} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-slate-900 text-white w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold">P{page.pageNumber}</div>
                      <h4 className="text-xs font-bold text-slate-800 truncate">{page.title}</h4>
                    </div>
                    <div className="space-y-4 border-l-2 border-slate-100 ml-2 pl-4">
                      {page.fields.map((field) => (
                        <div key={field.id} className="space-y-1">
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{field.label}</label>
                          {field.type === 'boolean' ? (
                            <div className="flex items-center gap-2">
                              <input type="checkbox" checked={field.value as boolean} onChange={(e) => updateFieldValue(pIdx, field.id, e.target.checked)} className="w-4 h-4 text-blue-600 rounded cursor-pointer" />
                              <span className="text-[10px] text-slate-600">Sì / No</span>
                            </div>
                          ) : (
                            <input 
                              type={field.type} 
                              value={field.value as string} 
                              onChange={(e) => updateFieldValue(pIdx, field.id, e.target.value)} 
                              className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs outline-none focus:ring-1 focus:ring-blue-500 transition-all" 
                              placeholder={field.placeholder}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="p-4 bg-slate-50 border-t border-slate-200">
                <button onClick={() => setIsPreviewMode(true)} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-md">
                  <Eye className="w-4 h-4" /> Anteprima di Stampa
                </button>
              </div>
            </aside>

            {/* Area Documento */}
            <div className={`flex-1 flex flex-col bg-slate-200 overflow-hidden transition-all duration-300`}>
              
              {/* Barra Strumenti Anteprima (Solo se in modalità anteprima) */}
              <nav className={`bg-white border-b border-slate-300 p-3 no-print flex flex-wrap items-center justify-between gap-4 z-30 shadow-sm transition-all duration-300 overflow-hidden ${isPreviewMode ? 'max-h-40 py-3' : 'max-h-0 py-0 border-0'}`}>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                    <button 
                      onClick={() => setPrintOrientation('portrait')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${printOrientation === 'portrait' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Layout className="w-3 h-3" /> Verticale
                    </button>
                    <button 
                      onClick={() => setPrintOrientation('landscape')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${printOrientation === 'landscape' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Layout className="w-3 h-3 rotate-90" /> Orizzontale
                    </button>
                  </div>
                  
                  <div className="h-6 w-px bg-slate-300"></div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Seleziona Pagine:</span>
                    <div className="flex gap-1">
                      {pagesData.map(p => (
                        <button 
                          key={p.pageNumber}
                          onClick={() => togglePrintPage(p.pageNumber)}
                          className={`w-6 h-6 rounded text-[10px] font-bold border transition-all ${selectedPrintPages.includes(p.pageNumber) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-200'}`}
                        >
                          {p.pageNumber}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => setIsPreviewMode(false)} className="text-slate-500 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </nav>

              <div className="flex-1 p-4 md:p-12 overflow-y-auto flex flex-col items-center no-scrollbar scroll-container print:p-0 print:bg-white print:overflow-visible relative">
                <div id="printable-root" className={`flex flex-col gap-12 w-full transition-all duration-500 ${printOrientation === 'portrait' ? 'max-w-[850px]' : 'max-w-[1150px]'} print:gap-0 print:max-w-none`}>
                  {pagesData
                    .filter(page => selectedPrintPages.includes(page.pageNumber))
                    .map((page, pIdx) => (
                    <div key={pIdx} className={`bg-white shadow-2xl p-10 md:p-16 print:shadow-none print:p-12 min-h-[1050px] relative transition-all print-page flex flex-col border border-slate-300 hover:border-blue-400 group`}>
                      
                      {/* Indicatore Pagina (Solo in Anteprima) */}
                      <div className="absolute top-4 left-4 no-print opacity-30 group-hover:opacity-100 transition-opacity">
                        <span className="bg-slate-900 text-white text-[10px] px-2 py-1 rounded font-bold uppercase">Pagina {page.pageNumber}</span>
                      </div>

                      <div className="flex justify-between items-start mb-12 border-b-2 border-slate-900 pb-6">
                        <div>
                          <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">{page.title}</h2>
                          <p className="text-slate-400 mt-2 font-mono text-[10px] tracking-widest uppercase">Documento Digitale • ID-{Math.random().toString(36).substr(2, 6).toUpperCase()}</p>
                        </div>
                        <div className="w-14 h-14 bg-slate-900 text-white flex items-center justify-center rounded-xl shadow-lg">
                          <FileText className="w-7 h-7" />
                        </div>
                      </div>

                      <div className={`grid gap-x-12 gap-y-10 ${printOrientation === 'portrait' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'} print-grid flex-1`}>
                        {page.fields.map((field) => (
                          <div key={field.id} className="border-b border-slate-100 pb-2 flex flex-col justify-end">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{field.label}</p>
                            <div className="min-h-[1.8rem] flex items-center">
                              {field.type === 'boolean' ? (
                                <div className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black border-2 transition-all ${field.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                                  {field.value ? <Check className="w-3 h-3" /> : null}
                                  {field.value ? 'CONFERMATO' : 'NON SELEZIONATO'}
                                </div>
                              ) : (
                                <span className="text-lg font-bold text-slate-900 break-words border-l-4 border-blue-600 pl-4 leading-tight italic">
                                  {field.value || '_________________'}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-16 flex justify-between items-end border-t border-slate-100 pt-10">
                         <div className="max-w-xs">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2 underline decoration-blue-600 underline-offset-4">Certificazione</p>
                            <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                              Questo modulo è stato generato e compilato digitalmente tramite SmartPDF. La validità dei dati è garantita dall'utente firmatario.
                            </p>
                         </div>
                         <div className="flex flex-col items-end gap-3">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Luogo, Data e Firma</p>
                            <div className="w-64 border-b-2 border-slate-300 h-14 bg-slate-50/30 rounded-t-lg"></div>
                            <p className="text-[9px] text-slate-300 font-mono italic">GENERATO IL: {new Date().toLocaleDateString('it-IT')}</p>
                         </div>
                      </div>
                    </div>
                  ))}
                  
                  {selectedPrintPages.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center py-40 text-center">
                       <AlertCircle className="w-20 h-20 text-slate-300 mb-6" />
                       <h3 className="text-2xl font-bold text-slate-600 mb-2">Seleziona pagine per la stampa</h3>
                       <p className="text-slate-400">Clicca sui numeri in alto per scegliere cosa includere nel PDF finale.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Snackbar IA (Template originale) */}
      {isPrefilling && (
        <div className="fixed bottom-8 right-8 z-50 animate-bounce">
          <div className="bg-indigo-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 border-indigo-400">
             <Sparkles className="w-6 h-6 animate-pulse" />
             <span className="font-bold text-sm">L'IA sta completando i moduli...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
