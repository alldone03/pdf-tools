import React, { useState, useRef, useEffect } from 'react';
import Dropzone from '../components/Dropzone';
import { saveAs } from 'file-saver';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
    Loader2, Download, ArrowLeft, ArrowRight, X, Plus, Trash2, Copy, Type,
    Square, Circle, Minus, Layers, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown
} from 'lucide-react';

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

    // Unified Elements array (array index defines z-index / layer order)
    const [elements, setElements] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [signatureLibrary, setSignatureLibrary] = useState([]); // Unique signature images for reuse

    const [isDragging, setIsDragging] = useState(false);
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
            type: 'signature',
            image: libItem.image,
            x: 50,
            y: 50,
            size: 150,
            aspect: libItem.aspect,
            page: currPage,
            name: libItem.name
        };

        setElements(prev => [...prev, newSig]);
        setSelectedId(newSig.id);
    };

    const processRemoveBg = async (sigId) => {
        const sig = elements.find(s => s.id === sigId && s.type === 'signature');
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

        setElements(elements.map(el => el.id === sigId ? { ...el, image: newImg } : el));
    };

    // Text Operations
    const addText = () => {
        const newText = {
            id: crypto.randomUUID(),
            type: 'text',
            text: 'Masukkan Teks',
            font: 'TimesNewRoman',
            size: 24,
            color: '#000000',
            x: 60,
            y: 60,
            page: currPage
        };
        setElements(prev => [...prev, newText]);
        setSelectedId(newText.id);
    };

    // Shape Operations
    const addShape = (shapeType) => {
        const newShape = {
            id: crypto.randomUUID(),
            type: 'shape',
            shapeType: shapeType, // 'rectangle' | 'circle' | 'line'
            x: 70,
            y: 70,
            width: shapeType === 'line' ? 150 : 120,
            height: shapeType === 'line' ? 0 : 80,
            fillColor: shapeType === 'line' ? 'none' : '#3b82f6',
            strokeColor: '#000000',
            strokeWidth: 2,
            page: currPage
        };
        setElements(prev => [...prev, newShape]);
        setSelectedId(newShape.id);
    };

    const removeElement = (id) => {
        setElements(elements.filter(el => el.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    const updateElement = (id, updates) => {
        setElements(elements.map(el => el.id === id ? { ...el, ...updates } : el));
    };

    const duplicateElement = (id) => {
        const el = elements.find(item => item.id === id);
        if (!el) return;

        const newEl = {
            ...el,
            id: crypto.randomUUID(),
            x: el.page === currPage ? el.x + 20 : 50,
            y: el.page === currPage ? el.y + 20 : 50,
            page: currPage,
        };

        setElements(prev => [...prev, newEl]);
        setSelectedId(newEl.id);
    };

    // Layer Ordering / Z-Index Management
    const moveLayerUp = (id) => {
        setElements(prev => {
            const idx = prev.findIndex(el => el.id === id);
            if (idx === -1 || idx === prev.length - 1) return prev;
            const targetPage = prev[idx].page;
            let nextIdx = -1;
            for (let i = idx + 1; i < prev.length; i++) {
                if (prev[i].page === targetPage) {
                    nextIdx = i;
                    break;
                }
            }
            if (nextIdx === -1) return prev;

            const newArr = [...prev];
            const temp = newArr[idx];
            newArr[idx] = newArr[nextIdx];
            newArr[nextIdx] = temp;
            return newArr;
        });
    };

    const moveLayerDown = (id) => {
        setElements(prev => {
            const idx = prev.findIndex(el => el.id === id);
            if (idx <= 0) return prev;
            const targetPage = prev[idx].page;
            let prevIdx = -1;
            for (let i = idx - 1; i >= 0; i--) {
                if (prev[i].page === targetPage) {
                    prevIdx = i;
                    break;
                }
            }
            if (prevIdx === -1) return prev;

            const newArr = [...prev];
            const temp = newArr[idx];
            newArr[idx] = newArr[prevIdx];
            newArr[prevIdx] = temp;
            return newArr;
        });
    };

    const bringToFront = (id) => {
        setElements(prev => {
            const idx = prev.findIndex(el => el.id === id);
            if (idx === -1 || idx === prev.length - 1) return prev;
            const newArr = [...prev];
            const [item] = newArr.splice(idx, 1);
            newArr.push(item);
            return newArr;
        });
    };

    const sendToBack = (id) => {
        setElements(prev => {
            const idx = prev.findIndex(el => el.id === id);
            if (idx === -1 || idx === 0) return prev;
            const newArr = [...prev];
            const [item] = newArr.splice(idx, 1);
            newArr.unshift(item);
            return newArr;
        });
    };

    // Render Page & Draw Elements in Layer Order
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

            // Render Elements on this page in array sequence (layer order)
            const pageElements = elements.filter(el => el.page === currPage);
            pageElements.forEach(el => {
                if (el.type === 'signature') {
                    drawSignature(context, el);
                } else if (el.type === 'text') {
                    drawText(context, el);
                } else if (el.type === 'shape') {
                    drawShape(context, el);
                }
            });
        };
        render();
    }, [pdfDoc, currPage, elements, selectedId]);

    const drawSignature = (ctx, sig) => {
        const h = sig.size * sig.aspect;
        ctx.drawImage(sig.image, sig.x, sig.y, sig.size, h);

        if (sig.id === selectedId) {
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

        if (txt.id === selectedId) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(txt.x - 4, txt.y - 4, textWidth + 8, textHeight + 8);
            ctx.setLineDash([]);

            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(txt.x + textWidth + 2, txt.y + textHeight + 2, 8, 8);
        }
    };

    const drawShape = (ctx, shp) => {
        const { x, y, width, height, shapeType, fillColor, strokeColor, strokeWidth } = shp;
        ctx.save();
        ctx.lineWidth = strokeWidth || 2;
        ctx.strokeStyle = strokeColor || '#000000';
        ctx.fillStyle = fillColor === 'none' ? 'transparent' : (fillColor || '#3b82f6');

        if (shapeType === 'rectangle') {
            if (fillColor && fillColor !== 'none') {
                ctx.fillRect(x, y, width, height);
            }
            if (strokeWidth > 0) {
                ctx.strokeRect(x, y, width, height);
            }
        } else if (shapeType === 'circle') {
            const rx = Math.abs(width / 2);
            const ry = Math.abs(height / 2);
            const cx = x + rx;
            const cy = y + ry;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
            if (fillColor && fillColor !== 'none') {
                ctx.fill();
            }
            if (strokeWidth > 0) {
                ctx.stroke();
            }
        } else if (shapeType === 'line') {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y + height);
            ctx.stroke();
        }
        ctx.restore();

        if (shp.id === selectedId) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            const boxW = shapeType === 'line' ? Math.max(Math.abs(width), 20) : width;
            const boxH = shapeType === 'line' ? Math.max(Math.abs(height), 20) : height;
            ctx.strokeRect(x - 4, y - 4, boxW + 8, boxH + 8);
            ctx.setLineDash([]);

            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(x + boxW + 2, y + boxH + 2, 8, 8);
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

        // Check elements in reverse order (top-most layer first)
        const pageElements = [...elements].reverse().filter(el => el.page === currPage);
        const clicked = pageElements.find(el => {
            if (el.type === 'text') {
                const fontOption = FONT_OPTIONS.find(f => f.value === el.font) || FONT_OPTIONS[0];
                ctx.font = `${el.size}px ${fontOption.family}`;
                const metrics = ctx.measureText(el.text);
                const w = Math.max(metrics.width, 20);
                const h = el.size;
                return x >= el.x - 4 && x <= el.x + w + 4 &&
                    y >= el.y - 4 && y <= el.y + h + 4;
            } else if (el.type === 'signature') {
                const h = el.size * el.aspect;
                return x >= el.x && x <= el.x + el.size &&
                    y >= el.y && y <= el.y + h;
            } else if (el.type === 'shape') {
                const boxW = el.shapeType === 'line' ? Math.max(Math.abs(el.width), 20) : el.width;
                const boxH = el.shapeType === 'line' ? Math.max(Math.abs(el.height), 20) : el.height;
                return x >= el.x - 4 && x <= el.x + boxW + 4 &&
                    y >= el.y - 4 && y <= el.y + boxH + 4;
            }
            return false;
        });

        if (clicked) {
            setSelectedId(clicked.id);
            setIsDragging(true);
            setDragOffset({ x: x - clicked.x, y: y - clicked.y });
        } else {
            setSelectedId(null);
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging && selectedId) {
            const rect = canvasRef.current.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
            const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);

            updateElement(selectedId, {
                x: x - dragOffset.x,
                y: y - dragOffset.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const runSave = async () => {
        if (!pdfFile || elements.length === 0) return;
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

            const parseHexColor = (hex) => {
                if (!hex || hex === 'none') return null;
                let c = hex.replace('#', '');
                if (c.length === 3) c = c.split('').map(x => x + x).join('');
                const num = parseInt(c, 16);
                return rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
            };

            // Render elements in exact layer order per page
            for (let pageIdx = 0; pageIdx < pdfPages.length; pageIdx++) {
                const pageNum = pageIdx + 1;
                const page = pdfPages[pageIdx];
                const { width: pageWidth, height: pageHeight } = page.getSize();

                const canvasW = pageViewport.width;
                const canvasH = pageViewport.height;

                const ratioX = pageWidth / canvasW;
                const ratioY = pageHeight / canvasH;

                const pageElements = elements.filter(el => el.page === pageNum);

                for (const el of pageElements) {
                    if (el.type === 'signature') {
                        const fetchRes = await fetch(el.image.src);
                        const sigArrayBuffer = await fetchRes.arrayBuffer();
                        const embeddedSig = await pdfDocLib.embedPng(sigArrayBuffer);

                        const h = el.size * el.aspect;
                        const finalX = el.x * ratioX;
                        const finalY = pageHeight - ((el.y + h) * ratioY);
                        const finalW = el.size * ratioX;
                        const finalH = h * ratioY;

                        page.drawImage(embeddedSig, {
                            x: finalX,
                            y: finalY,
                            width: finalW,
                            height: finalH
                        });
                    } else if (el.type === 'text') {
                        const embeddedFont = fontCache[el.font] || fontCache['TimesNewRoman'];
                        const finalFontSize = el.size * ratioY;

                        const finalX = el.x * ratioX;
                        const finalY = pageHeight - ((el.y + el.size * 0.8) * ratioY);

                        page.drawText(el.text, {
                            x: finalX,
                            y: finalY,
                            size: finalFontSize,
                            font: embeddedFont,
                            color: parseHexColor(el.color) || rgb(0, 0, 0)
                        });
                    } else if (el.type === 'shape') {
                        const finalX = el.x * ratioX;
                        const finalW = el.width * ratioX;
                        const finalH = el.height * ratioY;
                        const finalY = pageHeight - ((el.y + el.height) * ratioY);

                        const fillColor = parseHexColor(el.fillColor);
                        const strokeColor = parseHexColor(el.strokeColor);
                        const borderWidth = (el.strokeWidth || 0) * ratioX;

                        if (el.shapeType === 'rectangle') {
                            page.drawRectangle({
                                x: finalX,
                                y: finalY,
                                width: finalW,
                                height: finalH,
                                color: fillColor || undefined,
                                borderColor: strokeColor || undefined,
                                borderWidth: strokeColor && borderWidth > 0 ? borderWidth : 0
                            });
                        } else if (el.shapeType === 'circle') {
                            const rx = Math.abs(finalW / 2);
                            const ry = Math.abs(finalH / 2);
                            const cx = finalX + rx;
                            const cy = finalY + ry;
                            page.drawEllipse({
                                x: cx,
                                y: cy,
                                xScale: rx,
                                yScale: ry,
                                color: fillColor || undefined,
                                borderColor: strokeColor || undefined,
                                borderWidth: strokeColor && borderWidth > 0 ? borderWidth : 0
                            });
                        } else if (el.shapeType === 'line') {
                            const startX = el.x * ratioX;
                            const startY = pageHeight - (el.y * ratioY);
                            const endX = (el.x + el.width) * ratioX;
                            const endY = pageHeight - ((el.y + el.height) * ratioY);

                            page.drawLine({
                                start: { x: startX, y: startY },
                                end: { x: endX, y: endY },
                                thickness: (el.strokeWidth || 2) * ratioX,
                                color: strokeColor || rgb(0, 0, 0)
                            });
                        }
                    }
                }
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

    const selectedElement = elements.find(el => el.id === selectedId);
    const currentPageElements = elements.filter(el => el.page === currPage);

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center space-x-3">
                    <div className="bg-blue-600 p-2 rounded-lg text-white">
                        <Download size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 leading-tight">Sign & Edit PDF</h2>
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
                        disabled={elements.length === 0 || processing}
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
                                className="flex items-center justify-center gap-2 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-xs transition-colors border border-blue-200 shadow-sm cursor-pointer"
                            >
                                <Type size={16} />
                                <span>Teks</span>
                            </button>

                            <Dropzone
                                onDrop={onDropSig}
                                accept={{ 'image/*': [] }}
                                multiple={false}
                                className="h-full p-1.5 min-h-0 border-dashed border-2 bg-slate-50 hover:bg-blue-50 transition-colors rounded-xl flex items-center justify-center"
                                content={
                                    <div className="flex items-center justify-center gap-1.5">
                                        <Plus size={14} className="text-blue-500" />
                                        <span className="text-xs font-semibold text-slate-600">TTD Gambar</span>
                                    </div>
                                }
                            />
                        </div>

                        {/* Shape Quick Add Buttons */}
                        <div className="pt-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">Tambah Shape / Bentuk</label>
                            <div className="grid grid-cols-3 gap-1.5">
                                <button
                                    onClick={() => addShape('rectangle')}
                                    className="flex items-center justify-center gap-1 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg border border-slate-200 text-xs font-semibold transition-all"
                                    title="Tambah Persei / Rectangle"
                                >
                                    <Square size={14} />
                                    <span>Kotak</span>
                                </button>
                                <button
                                    onClick={() => addShape('circle')}
                                    className="flex items-center justify-center gap-1 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg border border-slate-200 text-xs font-semibold transition-all"
                                    title="Tambah Lingkaran"
                                >
                                    <Circle size={14} />
                                    <span>Circle</span>
                                </button>
                                <button
                                    onClick={() => addShape('line')}
                                    className="flex items-center justify-center gap-1 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg border border-slate-200 text-xs font-semibold transition-all"
                                    title="Tambah Garis"
                                >
                                    <Minus size={14} />
                                    <span>Garis</span>
                                </button>
                            </div>
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
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Layers size={14} />
                                Lapisan Elemen
                            </h3>
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                {elements.length}
                            </span>
                        </div>

                        {elements.length === 0 ? (
                            <div className="text-center py-10">
                                <p className="text-sm text-slate-400 italic">Belum ada elemen ditambahkan</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* Display elements in reverse order (top layer at top of UI list) */}
                                {[...elements].reverse().map((el, revIdx) => {
                                    const layerNum = elements.length - revIdx;
                                    const isSelected = selectedId === el.id;

                                    return (
                                        <div
                                            key={el.id}
                                            onClick={() => { setSelectedId(el.id); setCurrPage(el.page); }}
                                            className={`group relative p-2.5 rounded-xl border-2 transition-all cursor-pointer ${isSelected
                                                ? 'border-blue-500 bg-blue-50/80 shadow-sm'
                                                : 'border-slate-100 bg-white hover:border-blue-200'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center shrink-0 bg-slate-50 text-slate-600 text-xs font-bold">
                                                    {el.type === 'text' && <Type size={16} className="text-blue-600" />}
                                                    {el.type === 'signature' && <img src={el.image.src} className="max-h-full max-w-full object-contain p-0.5" alt="Sig" />}
                                                    {el.type === 'shape' && (
                                                        <>
                                                            {el.shapeType === 'rectangle' && <Square size={16} className="text-purple-600" />}
                                                            {el.shapeType === 'circle' && <Circle size={16} className="text-purple-600" />}
                                                            {el.shapeType === 'line' && <Minus size={16} className="text-purple-600" />}
                                                        </>
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-700 truncate">
                                                        {el.type === 'text' && (el.text || 'Teks')}
                                                        {el.type === 'signature' && (el.name || 'TTD Gambar')}
                                                        {el.type === 'shape' && `Shape (${el.shapeType})`}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 font-medium">
                                                        Hal {el.page} • Lapis {layerNum}
                                                    </p>
                                                </div>

                                                {/* Layer Controls */}
                                                <div className="flex items-center gap-0.5">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); moveLayerUp(el.id); }}
                                                        className="text-slate-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded transition-colors"
                                                        title="Naikkan Lapisan (Move Up)"
                                                    >
                                                        <ArrowUp size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); moveLayerDown(el.id); }}
                                                        className="text-slate-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded transition-colors"
                                                        title="Turunkan Lapisan (Move Down)"
                                                    >
                                                        <ArrowDown size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
                                                        className="text-slate-300 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-colors"
                                                        title="Hapus Elemen"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Selected Element Edit Panel */}
                    {selectedElement && (
                        <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-4 max-h-[350px] overflow-y-auto">
                            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                    <Layers size={14} className="text-blue-600" />
                                    Edit {selectedElement.type === 'text' ? 'Teks' : selectedElement.type === 'shape' ? 'Shape' : 'TTD'}
                                </h4>
                                <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                            </div>

                            {/* Layer Reordering Quick Toolbar */}
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Urutan Lapisan (Layer)</label>
                                <div className="grid grid-cols-4 gap-1">
                                    <button
                                        onClick={() => bringToFront(selectedId)}
                                        className="py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex flex-col items-center justify-center"
                                        title="Paling Depan"
                                    >
                                        <ChevronsUp size={14} />
                                        <span>Top</span>
                                    </button>
                                    <button
                                        onClick={() => moveLayerUp(selectedId)}
                                        className="py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex flex-col items-center justify-center"
                                        title="Naik Satu Lapisan"
                                    >
                                        <ArrowUp size={14} />
                                        <span>Up</span>
                                    </button>
                                    <button
                                        onClick={() => moveLayerDown(selectedId)}
                                        className="py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex flex-col items-center justify-center"
                                        title="Turun Satu Lapisan"
                                    >
                                        <ArrowDown size={14} />
                                        <span>Down</span>
                                    </button>
                                    <button
                                        onClick={() => sendToBack(selectedId)}
                                        className="py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex flex-col items-center justify-center"
                                        title="Paling Belakang"
                                    >
                                        <ChevronsDown size={14} />
                                        <span>Bottom</span>
                                    </button>
                                </div>
                            </div>

                            {/* Text Controls */}
                            {selectedElement.type === 'text' && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Isi Teks</label>
                                        <input
                                            type="text"
                                            value={selectedElement.text}
                                            onChange={(e) => updateElement(selectedId, { text: e.target.value })}
                                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="Masukkan teks..."
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Font Family</label>
                                            <select
                                                value={selectedElement.font}
                                                onChange={(e) => updateElement(selectedId, { font: e.target.value })}
                                                className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                            >
                                                {FONT_OPTIONS.map(f => (
                                                    <option key={f.value} value={f.value}>{f.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Warna Teks</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={selectedElement.color || '#000000'}
                                                    onChange={(e) => updateElement(selectedId, { color: e.target.value })}
                                                    className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                                                />
                                                <span className="text-[10px] font-mono text-slate-600">{selectedElement.color || '#000000'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                            <span>UKURAN FONT</span>
                                            <span>{selectedElement.size}px</span>
                                        </div>
                                        <input
                                            type="range" min="10" max="120"
                                            value={selectedElement.size}
                                            onChange={(e) => updateElement(selectedId, { size: parseInt(e.target.value) })}
                                            className="w-full accent-blue-600"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Shape Controls */}
                            {selectedElement.type === 'shape' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Warna Isi (Fill)</label>
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    type="color"
                                                    disabled={selectedElement.fillColor === 'none'}
                                                    value={selectedElement.fillColor === 'none' ? '#ffffff' : (selectedElement.fillColor || '#3b82f6')}
                                                    onChange={(e) => updateElement(selectedId, { fillColor: e.target.value })}
                                                    className="w-7 h-7 rounded border border-slate-200 cursor-pointer disabled:opacity-30"
                                                />
                                                <button
                                                    onClick={() => updateElement(selectedId, { fillColor: selectedElement.fillColor === 'none' ? '#3b82f6' : 'none' })}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded border ${selectedElement.fillColor === 'none' ? 'bg-slate-200 text-slate-700' : 'bg-white text-slate-600'}`}
                                                >
                                                    {selectedElement.fillColor === 'none' ? 'Transparan' : 'Isi ON'}
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Warna Garis (Stroke)</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={selectedElement.strokeColor || '#000000'}
                                                    onChange={(e) => updateElement(selectedId, { strokeColor: e.target.value })}
                                                    className="w-7 h-7 rounded border border-slate-200 cursor-pointer"
                                                />
                                                <span className="text-[10px] font-mono text-slate-600">{selectedElement.strokeColor || '#000000'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                            <span>LEBAR</span>
                                            <span>{selectedElement.width}px</span>
                                        </div>
                                        <input
                                            type="range" min="10" max="500"
                                            value={selectedElement.width}
                                            onChange={(e) => updateElement(selectedId, { width: parseInt(e.target.value) })}
                                            className="w-full accent-blue-600"
                                        />
                                    </div>

                                    {selectedElement.shapeType !== 'line' && (
                                        <div>
                                            <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                                <span>TINGGI</span>
                                                <span>{selectedElement.height}px</span>
                                            </div>
                                            <input
                                                type="range" min="10" max="500"
                                                value={selectedElement.height}
                                                onChange={(e) => updateElement(selectedId, { height: parseInt(e.target.value) })}
                                                className="w-full accent-blue-600"
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                            <span>TEBAL GARIS</span>
                                            <span>{selectedElement.strokeWidth}px</span>
                                        </div>
                                        <input
                                            type="range" min="1" max="20"
                                            value={selectedElement.strokeWidth}
                                            onChange={(e) => updateElement(selectedId, { strokeWidth: parseInt(e.target.value) })}
                                            className="w-full accent-blue-600"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Signature Controls */}
                            {selectedElement.type === 'signature' && (
                                <div className="space-y-3">
                                    <div>
                                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                            <span>UKURAN / SIZE</span>
                                            <span>{selectedElement.size}px</span>
                                        </div>
                                        <input
                                            type="range" min="50" max="600"
                                            value={selectedElement.size}
                                            onChange={(e) => updateElement(selectedId, { size: parseInt(e.target.value) })}
                                            className="w-full accent-blue-600"
                                        />
                                    </div>

                                    <button
                                        onClick={() => processRemoveBg(selectedId)}
                                        className="w-full py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        Remove Background (Putih)
                                    </button>
                                </div>
                            )}

                            {/* Action Buttons for selected element */}
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                                <button
                                    onClick={() => duplicateElement(selectedId)}
                                    className="py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <Copy size={12} />
                                    Duplikat
                                </button>
                                <button
                                    onClick={() => removeElement(selectedId)}
                                    className="py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <Trash2 size={12} />
                                    Hapus
                                </button>
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
                            Klik elemen untuk mengedit & atur urutan lapisan (z-index)
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignPdf;
