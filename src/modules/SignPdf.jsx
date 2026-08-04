import React, { useState, useRef, useEffect } from 'react';
import Dropzone from '../components/Dropzone';
import { saveAs } from 'file-saver';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, Download, ArrowLeft, ArrowRight, X, Plus, Trash2, Copy, Type } from 'lucide-react';

const FONT_OPTIONS = [
    { label: 'Times New Roman', value: 'TimesNewRoman', family: "'Times New Roman', Times, serif", pdfFont: StandardFonts.TimesRoman },
    { label: 'Helvetica / Arial', value: 'Helvetica', family: "Helvetica, Arial, sans-serif", pdfFont: StandardFonts.Helvetica },
    { label: 'Courier', value: 'Courier', family: "'Courier New', Courier, monospace", pdfFont: StandardFonts.Courier },
];

const SignPdf = () => {
    const [pdfFile, setPdfFile] = useState(null);
    const [pdfDoc, setPdfDoc] = useState(null);
    const [numPages, setNumPages] = useState(0);
    const [currPage, setCurrPage] = useState(1);

    // Canvas & Interaction
    const canvasRef = useRef(null);
    const [pageViewport, setPageViewport] = useState(null);

    // Multiple Signatures state
    const [signatures, setSignatures] = useState([]); // Array of { id, image, x, y, size, aspect, page }
    const [signatureLibrary, setSignatureLibrary] = useState([]); // Unique signature images for reuse
    const [selectedSigId, setSelectedSigId] = useState(null);

    // Text state
    const [texts, setTexts] = useState([]); // Array of { id, text, font, size, color, x, y, page }
    const [selectedTextId, setSelectedTextId] = useState(null);

    const [isDragging, setIsDragging] = useState(false);
    const [dragType, setDragType] = useState(null); // 'sig' or 'text'
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const [processing, setProcessing] = useState(false);

    // Initial load of PDF
    useEffect(() => {
        if (pdfFile) {
            const loadPdf = async () => {
                const buffer = await pdfFile.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: buffer });
                const pdf = await loadingTask.promise;
                setPdfDoc(pdf);
                setNumPages(pdf.numPages);
                setCurrPage(1);
            };
            loadPdf();
        }
    }, [pdfFile]);

    // Handle new signature upload
    const onDropSig = async (files) => {
        const file = files[0];
        if (!file) return;

        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode();

        const aspect = img.height / img.width;

        const libraryItem = {
            id: crypto.randomUUID(),
            image: img,
            aspect: aspect,
            name: file.name
        };

        setSignatureLibrary(prev => [...prev, libraryItem]);
        addFromLibrary(libraryItem);
    };

    const addFromLibrary = (libItem) => {
        const newSig = {
            id: crypto.randomUUID(),
            image: libItem.image,
            x: 50,
            y: 50,
            size: 150,
            aspect: libItem.aspect,
            page: currPage,
            name: libItem.name
        };

        setSignatures(prev => [...prev, newSig]);
        setSelectedSigId(newSig.id);
        setSelectedTextId(null);
    };

    const processRemoveBg = async (sigId) => {
        const sig = signatures.find(s => s.id === sigId);
        if (!sig) return;

        const img = sig.image;
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (r > 230 && g > 230 && b > 230) {
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imgData, 0, 0);

        const newImg = new Image();
        newImg.src = canvas.toDataURL('image/png');
        await newImg.decode();

        setSignatures(signatures.map(s => s.id === sigId ? { ...s, image: newImg } : s));
    };

    const removeSignature = (id) => {
        setSignatures(signatures.filter(s => s.id !== id));
        if (selectedSigId === id) setSelectedSigId(null);
    };

    const updateSignature = (id, updates) => {
        setSignatures(signatures.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const duplicateSignature = (id) => {
        const sig = signatures.find(s => s.id === id);
        if (!sig) return;

        const newSig = {
            ...sig,
            id: crypto.randomUUID(),
            x: sig.page === currPage ? sig.x + 20 : 50,
            y: sig.page === currPage ? sig.y + 20 : 50,
            page: currPage,
        };

        setSignatures(prev => [...prev, newSig]);
        setSelectedSigId(newSig.id);
        setSelectedTextId(null);
    };

    // Text Operations
    const addText = () => {
        const newText = {
            id: crypto.randomUUID(),
            text: 'Masukkan Teks',
            font: 'TimesNewRoman',
            size: 24,
            color: '#000000',
            x: 60,
            y: 60,
            page: currPage
        };
        setTexts(prev => [...prev, newText]);
        setSelectedTextId(newText.id);
        setSelectedSigId(null);
    };

    const removeText = (id) => {
        setTexts(texts.filter(t => t.id !== id));
        if (selectedTextId === id) setSelectedTextId(null);
    };

    const updateText = (id, updates) => {
        setTexts(texts.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const duplicateText = (id) => {
        const txt = texts.find(t => t.id === id);
        if (!txt) return;

        const newText = {
            ...txt,
            id: crypto.randomUUID(),
            x: txt.page === currPage ? txt.x + 20 : 60,
            y: txt.page === currPage ? txt.y + 20 : 60,
            page: currPage,
        };

        setTexts(prev => [...prev, newText]);
        setSelectedTextId(newText.id);
        setSelectedSigId(null);
    };

    // Render Page & Draw Elements
    useEffect(() => {
        const render = async () => {
            if (!pdfDoc || !canvasRef.current) return;

            const page = await pdfDoc.getPage(currPage);
            const viewport = page.getViewport({ scale: 1.5 });
            setPageViewport(viewport);

            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render PDF Page
            await page.render({ canvasContext: context, viewport }).promise;

            // Render Signatures on this page
            const pageSigs = signatures.filter(s => s.page === currPage);
            pageSigs.forEach(sig => {
                drawSignature(context, sig);
            });

            // Render Texts on this page
            const pageTexts = texts.filter(t => t.page === currPage);
            pageTexts.forEach(txt => {
                drawText(context, txt);
            });
        };
        render();
    }, [pdfDoc, currPage, signatures, selectedSigId, texts, selectedTextId]);

    const drawSignature = (ctx, sig) => {
        const h = sig.size * sig.aspect;
        ctx.drawImage(sig.image, sig.x, sig.y, sig.size, h);

        if (sig.id === selectedSigId) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(sig.x, sig.y, sig.size, h);
            ctx.setLineDash([]);

            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(sig.x + sig.size - 5, sig.y + h - 5, 10, 10);
        }
    };

    const drawText = (ctx, txt) => {
        const fontOption = FONT_OPTIONS.find(f => f.value === txt.font) || FONT_OPTIONS[0];
        ctx.font = `${txt.size}px ${fontOption.family}`;
        ctx.fillStyle = txt.color || '#000000';
        ctx.textBaseline = 'top';

        ctx.fillText(txt.text, txt.x, txt.y);

        const metrics = ctx.measureText(txt.text);
        const textWidth = Math.max(metrics.width, 20);
        const textHeight = txt.size;

        if (txt.id === selectedTextId) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(txt.x - 4, txt.y - 4, textWidth + 8, textHeight + 8);
            ctx.setLineDash([]);

            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(txt.x + textWidth + 2, txt.y + textHeight + 2, 8, 8);
        }
    };

    // --- Inputs ---
    const onDropPdf = (files) => { setPdfFile(files[0]); };

    // --- Interaction Handlers ---
    const handleMouseDown = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
        const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
        const ctx = canvasRef.current.getContext('2d');

        // Check text items first (reverse order to get top-most)
        const pageTexts = [...texts].reverse().filter(t => t.page === currPage);
        const clickedText = pageTexts.find(txt => {
            const fontOption = FONT_OPTIONS.find(f => f.value === txt.font) || FONT_OPTIONS[0];
            ctx.font = `${txt.size}px ${fontOption.family}`;
            const metrics = ctx.measureText(txt.text);
            const w = Math.max(metrics.width, 20);
            const h = txt.size;
            return x >= txt.x - 4 && x <= txt.x + w + 4 &&
                y >= txt.y - 4 && y <= txt.y + h + 4;
        });

        if (clickedText) {
            setSelectedTextId(clickedText.id);
            setSelectedSigId(null);
            setIsDragging(true);
            setDragType('text');
            setDragOffset({ x: x - clickedText.x, y: y - clickedText.y });
            return;
        }

        // Check signature items
        const pageSigs = [...signatures].reverse().filter(s => s.page === currPage);
        const clickedSig = pageSigs.find(sig => {
            const h = sig.size * sig.aspect;
            return x >= sig.x && x <= sig.x + sig.size &&
                y >= sig.y && y <= sig.y + h;
        });

        if (clickedSig) {
            setSelectedSigId(clickedSig.id);
            setSelectedTextId(null);
            setIsDragging(true);
            setDragType('sig');
            setDragOffset({ x: x - clickedSig.x, y: y - clickedSig.y });
        } else {
            setSelectedSigId(null);
            setSelectedTextId(null);
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            const rect = canvasRef.current.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
            const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);

            if (dragType === 'text' && selectedTextId) {
                updateText(selectedTextId, {
                    x: x - dragOffset.x,
                    y: y - dragOffset.y
                });
            } else if (dragType === 'sig' && selectedSigId) {
                updateSignature(selectedSigId, {
                    x: x - dragOffset.x,
                    y: y - dragOffset.y
                });
            }
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setDragType(null);
    };

    const runSave = async () => {
        if (!pdfFile || (signatures.length === 0 && texts.length === 0)) return;
        setProcessing(true);
        try {
            const buffer = await pdfFile.arrayBuffer();
            const pdfDocLib = await PDFDocument.load(buffer);
            const pdfPages = pdfDocLib.getPages();

            // Cache embedded fonts
            const fontCache = {};
            for (const fontOpt of FONT_OPTIONS) {
                fontCache[fontOpt.value] = await pdfDocLib.embedFont(fontOpt.pdfFont);
            }

            // Embed signatures
            for (const sig of signatures) {
                const fetchRes = await fetch(sig.image.src);
                const sigArrayBuffer = await fetchRes.arrayBuffer();
                const embeddedSig = await pdfDocLib.embedPng(sigArrayBuffer);

                const page = pdfPages[sig.page - 1];
                const { width: pageWidth, height: pageHeight } = page.getSize();

                const canvasW = pageViewport.width;
                const canvasH = pageViewport.height;

                const ratioX = pageWidth / canvasW;
                const ratioY = pageHeight / canvasH;

                const h = sig.size * sig.aspect;

                const finalX = sig.x * ratioX;
                const finalY = pageHeight - ((sig.y + h) * ratioY);
                const finalW = sig.size * ratioX;
                const finalH = h * ratioY;

                page.drawImage(embeddedSig, {
                    x: finalX,
                    y: finalY,
                    width: finalW,
                    height: finalH
                });
            }

            // Embed texts
            for (const txt of texts) {
                const page = pdfPages[txt.page - 1];
                const { width: pageWidth, height: pageHeight } = page.getSize();

                const canvasW = pageViewport.width;
                const canvasH = pageViewport.height;

                const ratioX = pageWidth / canvasW;
                const ratioY = pageHeight / canvasH;

                const embeddedFont = fontCache[txt.font] || fontCache['TimesNewRoman'];
                const finalFontSize = txt.size * ratioY;

                const finalX = txt.x * ratioX;
                const finalY = pageHeight - ((txt.y + txt.size * 0.8) * ratioY);

                const parseHexColor = (hex) => {
                    let c = (hex || '#000000').replace('#', '');
                    if (c.length === 3) c = c.split('').map(x => x + x).join('');
                    const num = parseInt(c, 16);
                    return rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
                };

                page.drawText(txt.text, {
                    x: finalX,
                    y: finalY,
                    size: finalFontSize,
                    font: embeddedFont,
                    color: parseHexColor(txt.color)
                });
            }

            const pdfBytes = await pdfDocLib.save();
            saveAs(new Blob([pdfBytes], { type: 'application/pdf' }), `signed_${pdfFile.name}`);

        } catch (e) {
            console.error(e);
            alert("Error saving: " + e.message);
        }
        setProcessing(false);
    };

    if (!pdfFile) {
        return (
            <div className="p-8 max-w-3xl mx-auto space-y-8">
                <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Sign PDF</h2>
                <div className="bg-white p-12 rounded-2xl shadow-xl border border-slate-100 text-center">
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Plus size={40} />
                    </div>
                    <h3 className="text-2xl font-semibold mb-2">Upload your PDF</h3>
                    <p className="text-slate-500 mb-8">Choose the PDF document you want to sign</p>
                    <Dropzone onDrop={onDropPdf} accept={{ 'application/pdf': [] }} multiple={false} />
                </div>
            </div>
        );
    }

    const selectedSig = signatures.find(s => s.id === selectedSigId);
    const selectedText = texts.find(t => t.id === selectedTextId);

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center space-x-3">
                    <div className="bg-blue-600 p-2 rounded-lg text-white">
                        <Download size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 leading-tight">Sign PDF</h2>
                        <p className="text-xs text-slate-500 font-medium truncate max-w-[200px]">{pdfFile.name}</p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => setPdfFile(null)}
                        className="text-sm font-semibold text-slate-600 hover:text-red-600 transition-colors px-3 py-2 rounded-lg hover:bg-red-50"
                    >
                        Change PDF
                    </button>
                    <button
                        onClick={runSave}
                        disabled={(signatures.length === 0 && texts.length === 0) || processing}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold flex items-center transition-all shadow-lg shadow-blue-200 active:scale-95 cursor-pointer"
                    >
                        {processing ? <Loader2 className="animate-spin mr-2" size={18} /> : <Download className="mr-2" size={18} />}
                        Save Signed PDF
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full shadow-sm">
                    <div className="p-4 border-b border-slate-100 space-y-3">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Tambah Elemen</h3>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={addText}
                                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-xs transition-colors border border-blue-200 shadow-sm cursor-pointer"
                            >
                                <Type size={16} />
                                <span>Teks</span>
                            </button>

                            <Dropzone
                                onDrop={onDropSig}
                                accept={{ 'image/*': [] }}
                                multiple={false}
                                className="h-full p-2 min-h-0 border-dashed border-2 bg-slate-50 hover:bg-blue-50 transition-colors rounded-xl"
                                content={
                                    <div className="flex items-center justify-center gap-1.5">
                                        <Plus size={16} className="text-blue-500" />
                                        <span className="text-xs font-semibold text-slate-600">TTD Gambar</span>
                                    </div>
                                }
                            />
                        </div>
                    </div>

                    {/* Signature Library */}
                    {signatureLibrary.length > 0 && (
                        <div className="p-4 border-b border-slate-100 bg-slate-50/30">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Library TTD (Reuse)</h3>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {signatureLibrary.map(lib => (
                                    <button
                                        key={lib.id}
                                        onClick={() => addFromLibrary(lib)}
                                        className="w-14 h-14 bg-white border border-slate-200 rounded-lg p-1 hover:border-blue-500 hover:shadow-md transition-all shrink-0 flex items-center justify-center group relative"
                                        title="Click to add to current page"
                                    >
                                        <img src={lib.image.src} className="max-h-full max-w-full object-contain" alt="Lib" />
                                        <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg">
                                            <Plus size={16} className="text-blue-600" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Elemen Terpasang</h3>
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                {signatures.length + texts.length}
                            </span>
                        </div>

                        {signatures.length === 0 && texts.length === 0 ? (
                            <div className="text-center py-10">
                                <p className="text-sm text-slate-400 italic">Belum ada TTD / Teks ditambahkan</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Text list */}
                                {texts.map((txt) => (
                                    <div
                                        key={txt.id}
                                        onClick={() => { setSelectedTextId(txt.id); setSelectedSigId(null); setCurrPage(txt.page); }}
                                        className={`group relative p-3 rounded-xl border-2 transition-all cursor-pointer ${selectedTextId === txt.id
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-slate-100 bg-white hover:border-blue-200'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 flex items-center justify-center shrink-0 shadow-sm">
                                                <Type size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-slate-700 truncate">{txt.text || 'Teks'}</p>
                                                <p className="text-[10px] text-slate-500 font-medium">Hal {txt.page} • {txt.font} • {txt.size}px</p>
                                            </div>
                                            <div className="flex flex-col gap-1 items-center">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); duplicateText(txt.id); }}
                                                    className="text-slate-300 hover:text-blue-500 transition-colors p-1"
                                                    title="Duplicate"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeText(txt.id); }}
                                                    className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                                    title="Remove"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* Signature list */}
                                {signatures.map((sig) => (
                                    <div
                                        key={sig.id}
                                        onClick={() => { setSelectedSigId(sig.id); setSelectedTextId(null); setCurrPage(sig.page); }}
                                        className={`group relative p-3 rounded-xl border-2 transition-all cursor-pointer ${selectedSigId === sig.id
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-slate-100 bg-white hover:border-blue-200'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white rounded-lg border border-slate-200 p-1 flex items-center justify-center shrink-0 shadow-sm">
                                                <img src={sig.image.src} className="max-h-full max-w-full object-contain" alt="Sig" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-slate-700 truncate">{sig.name || 'Signature'}</p>
                                                <p className="text-[10px] text-slate-500 font-medium">Hal {sig.page}</p>
                                            </div>
                                            <div className="flex flex-col gap-1 items-center">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); duplicateSignature(sig.id); }}
                                                    className="text-slate-300 hover:text-blue-500 transition-colors p-1"
                                                    title="Duplicate"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeSignature(sig.id); }}
                                                    className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                                    title="Remove"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Selected Text Edit Panel */}
                    {selectedText && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                    <Type size={14} className="text-blue-600" />
                                    Edit Teks
                                </h4>
                                <button onClick={() => setSelectedTextId(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Isi Teks</label>
                                    <input
                                        type="text"
                                        value={selectedText.text}
                                        onChange={(e) => updateText(selectedTextId, { text: e.target.value })}
                                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Masukkan teks..."
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Font Family</label>
                                        <select
                                            value={selectedText.font}
                                            onChange={(e) => updateText(selectedTextId, { font: e.target.value })}
                                            className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                        >
                                            {FONT_OPTIONS.map(f => (
                                                <option key={f.value} value={f.value}>{f.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Warna</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={selectedText.color || '#000000'}
                                                onChange={(e) => updateText(selectedTextId, { color: e.target.value })}
                                                className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                                            />
                                            <span className="text-[10px] font-mono text-slate-600">{selectedText.color || '#000000'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                        <span>UKURAN FONT</span>
                                        <span>{selectedText.size}px</span>
                                    </div>
                                    <input
                                        type="range" min="10" max="120"
                                        value={selectedText.size}
                                        onChange={(e) => updateText(selectedTextId, { size: parseInt(e.target.value) })}
                                        className="w-full accent-blue-600"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => duplicateText(selectedTextId)}
                                        className="py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        <Copy size={12} />
                                        Duplikat
                                    </button>
                                    <button
                                        onClick={() => removeText(selectedTextId)}
                                        className="py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        <Trash2 size={12} />
                                        Hapus
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Selected Signature Edit Panel */}
                    {selectedSig && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-slate-900">Edit Selected TTD</h4>
                                <button onClick={() => setSelectedSigId(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                        <span>SIZE</span>
                                        <span>{selectedSig.size}px</span>
                                    </div>
                                    <input
                                        type="range" min="50" max="600"
                                        value={selectedSig.size}
                                        onChange={(e) => updateSignature(selectedSigId, { size: parseInt(e.target.value) })}
                                        className="w-full accent-blue-600"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => processRemoveBg(selectedSigId)}
                                        className="py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        Remove BG
                                    </button>
                                    <button
                                        onClick={() => duplicateSignature(selectedSigId)}
                                        className="py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        <Copy size={12} />
                                        Duplicate
                                    </button>
                                </div>

                                <div className="text-[10px] text-blue-600 font-medium bg-blue-50 p-2 rounded-lg border border-blue-100 text-center">
                                    Dragging on canvas to reposition
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Main Viewport */}
                <div className="flex-1 relative overflow-auto bg-slate-200 flex flex-col items-center p-8">
                    <div className="relative shadow-2xl transition-all duration-300 hover:shadow-blue-900/10">
                        <canvas
                            ref={canvasRef}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            className="bg-white rounded-sm cursor-move shadow-inner"
                        />

                        {/* Page Controls Overlay */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-5 py-2.5 rounded-full flex items-center space-x-6 text-sm font-bold backdrop-blur-md shadow-2xl border border-white/10 z-20">
                            <button
                                onClick={() => setCurrPage(p => Math.max(1, p - 1))}
                                disabled={currPage === 1}
                                className="p-1 hover:text-blue-400 disabled:opacity-30 transition-all active:scale-90"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <span className="min-w-[80px] text-center tracking-tighter">PAGE {currPage} / {numPages}</span>
                            <button
                                onClick={() => setCurrPage(p => Math.min(numPages, p + 1))}
                                disabled={currPage === numPages}
                                className="p-1 hover:text-blue-400 disabled:opacity-30 transition-all active:scale-90"
                            >
                                <ArrowRight size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Floating Tips */}
                    <div className="mt-6 flex gap-4">
                        <div className="bg-white/50 backdrop-blur-sm px-4 py-2 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-200 uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                            Select an element to edit or drag to reposition
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignPdf;
