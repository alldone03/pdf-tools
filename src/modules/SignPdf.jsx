import React, { useState, useRef, useEffect } from 'react';
import Dropzone from '../components/Dropzone';
import { saveAs } from 'file-saver';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, Download, ArrowLeft, ArrowRight, X } from 'lucide-react';

const SignPdf = () => {
    const [pdfFile, setPdfFile] = useState(null);
    const [sigFile, setSigFile] = useState(null);
    const [pdfDoc, setPdfDoc] = useState(null);
    const [numPages, setNumPages] = useState(0);
    const [currPage, setCurrPage] = useState(1);

    // Canvas & Interaction
    const canvasRef = useRef(null);
    const [pageViewport, setPageViewport] = useState(null);
    const [sigPosition, setSigPosition] = useState({ x: 100, y: 100 });
    const [sigSize, setSigSize] = useState(150);
    const [sigImage, setSigImage] = useState(null); // Image Object (Original or Processed)
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [removeBg, setRemoveBg] = useState(false);

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

    // Process Signature (Remove BG)
    useEffect(() => {
        if (!sigFile) return;

        const processSig = async () => {
            const img = new Image();
            img.src = URL.createObjectURL(sigFile);
            await img.decode();

            if (!removeBg) {
                setSigImage(img);
                return;
            }

            // Remove White Background via Canvas
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
                // If white (or close to white)
                if (r > 230 && g > 230 && b > 230) {
                    data[i + 3] = 0; // Alpha = 0
                }
            }
            ctx.putImageData(imgData, 0, 0);

            const newImg = new Image();
            newImg.src = canvas.toDataURL('image/png');
            setSigImage(newImg);
        };
        processSig();

    }, [sigFile, removeBg]);


    // Render Page & Draw Signature
    useEffect(() => {
        const render = async () => {
            if (!pdfDoc || !canvasRef.current) return;

            const page = await pdfDoc.getPage(currPage);
            const viewport = page.getViewport({ scale: 1.0 });
            setPageViewport(viewport);

            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render PDF Page
            await page.render({ canvasContext: context, viewport }).promise;

            // Render Signature on top
            if (sigImage) {
                drawSignature(context);
            }
        };
        render();
    }, [pdfDoc, currPage, sigImage, sigPosition, sigSize]);

    const drawSignature = (ctx) => {
        if (!sigImage) return;
        const aspect = sigImage.height / sigImage.width;
        const h = sigSize * aspect;
        ctx.drawImage(sigImage, sigPosition.x, sigPosition.y, sigSize, h);

        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(sigPosition.x, sigPosition.y, sigSize, h);
    };

    // --- Inputs ---
    const onDropPdf = (files) => { setPdfFile(files[0]); };
    const onDropSig = (files) => { setSigFile(files[0]); };

    // --- Interaction Handlers ---
    const handleMouseDown = (e) => {
        if (!sigImage) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const aspect = sigImage.height / sigImage.width;
        const h = sigSize * aspect;

        if (x >= sigPosition.x && x <= sigPosition.x + sigSize &&
            y >= sigPosition.y && y <= sigPosition.y + h) {
            setIsDragging(true);
            setDragOffset({ x: x - sigPosition.x, y: y - sigPosition.y });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            const rect = canvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setSigPosition({ x: x - dragOffset.x, y: y - dragOffset.y });
        }
    };

    const handleMouseUp = () => { setIsDragging(false); };

    const runSave = async () => {
        if (!pdfFile || !sigImage) return;
        setProcessing(true);
        try {
            const buffer = await pdfFile.arrayBuffer();
            const pdfDocLib = await PDFDocument.load(buffer);

            // Convert current sigImage (src could be 'blob:' or 'data:') to buffer
            const fetchRes = await fetch(sigImage.src);
            const sigArrayBuffer = await fetchRes.arrayBuffer();

            const embeddedSig = await pdfDocLib.embedPng(sigArrayBuffer);

            const page = pdfDocLib.getPages()[currPage - 1];
            const { width, height } = page.getSize();

            const aspect = sigImage.height / sigImage.width;
            const h = sigSize * aspect;

            const x = sigPosition.x;
            const y = height - (sigPosition.y + h);

            page.drawImage(embeddedSig, { x, y, width: sigSize, height: h });

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
                <h2 className="text-3xl font-bold text-slate-800">Sign PDF</h2>
                <div className="bg-white p-8 rounded-xl shadow border border-slate-200 text-center">
                    <h3 className="text-xl font-medium mb-4">Step 1: Upload PDF</h3>
                    <Dropzone onDrop={onDropPdf} accept={{ 'application/pdf': [] }} multiple={false} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-4 px-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Sign PDF</h2>
                    <p className="text-xs text-slate-500">{pdfFile.name}</p>
                </div>
                <div className="flex items-center space-x-4">
                    <button onClick={() => setPdfFile(null)} className="text-sm text-red-500 hover:underline">Change PDF</button>
                    <button
                        onClick={runSave}
                        disabled={!sigFile || processing}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-6 py-2 rounded-lg font-medium flex items-center"
                    >
                        {processing ? <Loader2 className="animate-spin mr-2" /> : <Download className="mr-2" />}
                        Save Signed PDF
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden gap-4">
                <div className="w-80 bg-white rounded-xl shadow border border-slate-200 p-4 flex flex-col overflow-y-auto">
                    <div className="mb-6">
                        <h3 className="font-medium text-slate-700 mb-2">Step 2: Signature</h3>
                        {!sigFile ? (
                            <Dropzone onDrop={onDropSig} accept={{ 'image/*': [] }} multiple={false} className="h-32 p-4 min-h-0" />
                        ) : (
                            <div className="space-y-4">
                                <div className="relative group border border-slate-200 rounded p-2 text-center bg-slate-50">
                                    <img src={sigImage?.src} className="h-16 mx-auto object-contain" alt="Sig" />
                                    <button onClick={() => { setSigFile(null); setSigImage(null); }} className="absolute top-1 right-1 bg-red-100 text-red-500 p-1 rounded-full opacity-0 group-hover:opacity-100"><X size={12} /></button>
                                </div>

                                <label className="flex items-center space-x-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={removeBg}
                                        onChange={(e) => setRemoveBg(e.target.checked)}
                                        className="w-4 h-4 text-blue-600"
                                    />
                                    <span className="text-sm text-slate-700">Remove White Background</span>
                                </label>
                            </div>
                        )}
                    </div>

                    {sigFile && (
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-slate-600">Size: {sigSize}px</label>
                                <input
                                    type="range" min="50" max="400"
                                    value={sigSize}
                                    onChange={(e) => setSigSize(parseInt(e.target.value))}
                                    className="w-full mt-2"
                                />
                            </div>
                            <div className="text-xs text-slate-400 bg-slate-50 p-2 rounded">
                                Tip: Drag signature on canvas to position it.
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 bg-slate-100 rounded-xl border border-slate-200 relative overflow-auto flex justify-center p-8">
                    <div className="relative shadow-lg">
                        <canvas
                            ref={canvasRef}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            className="bg-white cursor-crosshair"
                        />
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/80 text-white px-4 py-2 rounded-full flex items-center space-x-4 text-sm backdrop-blur-sm">
                            <button onClick={() => setCurrPage(p => Math.max(1, p - 1))} disabled={currPage === 1} className="hover:text-blue-300 disabled:opacity-30"><ArrowLeft size={16} /></button>
                            <span>Page {currPage} / {numPages}</span>
                            <button onClick={() => setCurrPage(p => Math.min(numPages, p + 1))} disabled={currPage === numPages} className="hover:text-blue-300 disabled:opacity-30"><ArrowRight size={16} /></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignPdf;
