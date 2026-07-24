import React, { useState } from 'react';
import Dropzone from '../components/Dropzone';
import { saveAs } from 'file-saver';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, Download, Trash2, GripVertical, ArrowLeft, ArrowRight, FileText, Image as ImageIcon, Plus, FileDown } from 'lucide-react';

const OrganizePdf = () => {
    const [pages, setPages] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [logs, setLogs] = useState([]);

    // Drag and Drop States for Placement Suggestion
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    const addLog = (msg) => setLogs(prev => [...prev, msg]);

    // Handle Upload of files (PDF, PNG, JPG, JPEG, WEBP)
    const handleUploadFiles = async (acceptedFiles) => {
        if (!acceptedFiles || acceptedFiles.length === 0) return;
        setProcessing(true);
        const newPages = [];

        for (const file of acceptedFiles) {
            addLog(`Processing file: ${file.name}...`);
            const buffer = await file.arrayBuffer();

            if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) {
                try {
                    const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
                    const pdfProxy = await loadingTask.promise;

                    for (let i = 1; i <= pdfProxy.numPages; i++) {
                        const page = await pdfProxy.getPage(i);
                        const viewport = page.getViewport({ scale: 0.4 });
                        const canvas = document.createElement('canvas');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

                        newPages.push({
                            id: Math.random().toString(36).substring(2, 9),
                            sourceFileName: file.name,
                            originalIndex: i - 1,
                            image: canvas.toDataURL('image/png'),
                            fileBuffer: buffer,
                            fileType: 'application/pdf',
                            isImage: false
                        });
                    }
                    addLog(`Loaded ${pdfProxy.numPages} pages from ${file.name}`);
                } catch (e) {
                    console.error(e);
                    addLog(`Error reading PDF ${file.name}: ${e.message}`);
                }
            } else if (file.type.startsWith('image/')) {
                try {
                    const imgUrl = URL.createObjectURL(file);
                    newPages.push({
                        id: Math.random().toString(36).substring(2, 9),
                        sourceFileName: file.name,
                        originalIndex: 0,
                        image: imgUrl,
                        fileBuffer: buffer,
                        fileType: file.type,
                        isImage: true
                    });
                    addLog(`Loaded image ${file.name}`);
                } catch (e) {
                    console.error(e);
                    addLog(`Error loading image ${file.name}: ${e.message}`);
                }
            }
        }

        setPages(prev => [...prev, ...newPages]);
        setProcessing(false);
    };

    // Move page manually left / right
    const movePage = (index, direction) => {
        const newPages = [...pages];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newPages.length) return;
        [newPages[index], newPages[targetIndex]] = [newPages[targetIndex], newPages[index]];
        setPages(newPages);
    };

    // Delete single page
    const deletePage = (index) => {
        setPages(prev => prev.filter((_, i) => i !== index));
    };

    // Helper: Convert canvas data URL or Object URL to PNG ArrayBuffer for image embedding
    const urlToArrayBuffer = async (url) => {
        const response = await fetch(url);
        return await response.arrayBuffer();
    };

    // Download Single Page as PDF
    const downloadSinglePage = async (pageItem, index) => {
        setProcessing(true);
        addLog(`Exporting Page ${index + 1}...`);
        try {
            const singlePdf = await PDFDocument.create();

            if (pageItem.isImage) {
                let imgBuffer = pageItem.fileBuffer;
                if (!imgBuffer) {
                    imgBuffer = await urlToArrayBuffer(pageItem.image);
                }

                let embeddedImg;
                if (pageItem.fileType === 'image/jpeg' || pageItem.fileType === 'image/jpg') {
                    embeddedImg = await singlePdf.embedJpg(imgBuffer);
                } else {
                    embeddedImg = await singlePdf.embedPng(imgBuffer);
                }

                const page = singlePdf.addPage([embeddedImg.width, embeddedImg.height]);
                page.drawImage(embeddedImg, { x: 0, y: 0, width: embeddedImg.width, height: embeddedImg.height });
            } else {
                const srcDoc = await PDFDocument.load(pageItem.fileBuffer);
                const [copiedPage] = await singlePdf.copyPages(srcDoc, [pageItem.originalIndex]);
                singlePdf.addPage(copiedPage);
            }

            const pdfBytes = await singlePdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const cleanName = pageItem.sourceFileName.substring(0, pageItem.sourceFileName.lastIndexOf('.')) || 'page';
            saveAs(blob, `${cleanName}_page_${index + 1}.pdf`);
            addLog(`Downloaded Page ${index + 1} successfully!`);
        } catch (e) {
            console.error(e);
            addLog(`Error exporting single page: ${e.message}`);
        }
        setProcessing(false);
    };

    // Save/Merge All Pages into Single PDF
    const exportAllPdf = async () => {
        if (pages.length === 0) return;
        setProcessing(true);
        addLog("Exporting all organized pages to PDF...");
        try {
            const newPdf = await PDFDocument.create();
            const pdfDocCache = new Map();

            for (let i = 0; i < pages.length; i++) {
                const item = pages[i];
                if (item.isImage) {
                    let imgBuffer = item.fileBuffer;
                    if (!imgBuffer) {
                        imgBuffer = await urlToArrayBuffer(item.image);
                    }

                    let embeddedImg;
                    if (item.fileType === 'image/jpeg' || item.fileType === 'image/jpg') {
                        embeddedImg = await newPdf.embedJpg(imgBuffer);
                    } else {
                        embeddedImg = await newPdf.embedPng(imgBuffer);
                    }

                    const page = newPdf.addPage([embeddedImg.width, embeddedImg.height]);
                    page.drawImage(embeddedImg, { x: 0, y: 0, width: embeddedImg.width, height: embeddedImg.height });
                } else {
                    let srcDoc = pdfDocCache.get(item.fileBuffer);
                    if (!srcDoc) {
                        srcDoc = await PDFDocument.load(item.fileBuffer);
                        pdfDocCache.set(item.fileBuffer, srcDoc);
                    }
                    const [copiedPage] = await newPdf.copyPages(srcDoc, [item.originalIndex]);
                    newPdf.addPage(copiedPage);
                }
            }

            const pdfBytes = await newPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            saveAs(blob, `organized_document_${Date.now()}.pdf`);
            addLog("Organized PDF saved successfully!");
        } catch (e) {
            console.error(e);
            addLog(`Error saving PDF: ${e.message}`);
        }
        setProcessing(false);
    };

    // --- Drag and Drop Handlers for Grid Placement Suggestions ---
    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragLeave = (e, index) => {
        if (dragOverIndex === index) {
            setDragOverIndex(null);
        }
    };

    const handleDrop = (e, targetIndex) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === targetIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }

        const updatedPages = [...pages];
        const [movedItem] = updatedPages.splice(draggedIndex, 1);
        updatedPages.splice(targetIndex, 0, movedItem);

        setPages(updatedPages);
        setDraggedIndex(null);
        setDragOverIndex(null);
        addLog(`Moved page from position ${draggedIndex + 1} to ${targetIndex + 1}`);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800">Organize PDF & Images</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Upload PDFs or Images (PNG/JPG), reorder pages via drag & drop, delete, or download individual pages.
                    </p>
                </div>

                {pages.length > 0 && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPages([])}
                            className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            Clear All ({pages.length})
                        </button>
                        <button
                            onClick={exportAllPdf}
                            disabled={processing}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-sm"
                        >
                            {processing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            Download All (PDF)
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Workspace: Dropzone & Pages Grid */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Add / Upload Dropzone */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                        <Dropzone
                            onDrop={handleUploadFiles}
                            accept={{
                                'application/pdf': ['.pdf'],
                                'image/png': ['.png'],
                                'image/jpeg': ['.jpg', '.jpeg'],
                                'image/webp': ['.webp']
                            }}
                            multiple={true}
                        />
                    </div>

                    {/* Pages Grid with Drag Placement Indicator */}
                    {pages.length > 0 && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <span className="font-semibold text-slate-700 text-sm">
                                    Total Pages: <span className="text-blue-600 font-bold">{pages.length}</span>
                                </span>
                                <span className="text-xs text-slate-400">
                                    Drag cards to reorder position
                                </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-4">
                                {pages.map((page, i) => {
                                    const isBeingDragged = draggedIndex === i;
                                    const isTargetDrop = dragOverIndex === i && draggedIndex !== i;

                                    return (
                                        <div
                                            key={page.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, i)}
                                            onDragOver={(e) => handleDragOver(e, i)}
                                            onDragLeave={(e) => handleDragLeave(e, i)}
                                            onDrop={(e) => handleDrop(e, i)}
                                            onDragEnd={handleDragEnd}
                                            className={`relative group rounded-xl p-2.5 transition-all cursor-grab active:cursor-grabbing border ${
                                                isTargetDrop
                                                    ? 'border-2 border-dashed border-blue-500 bg-blue-50 scale-105 shadow-md ring-2 ring-blue-200'
                                                    : isBeingDragged
                                                    ? 'opacity-40 border-slate-300 bg-slate-100'
                                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:shadow-md'
                                            }`}
                                        >
                                            {/* Placement Target Drop Banner */}
                                            {isTargetDrop && (
                                                <div className="absolute inset-0 bg-blue-500/10 rounded-xl flex items-center justify-center pointer-events-none z-20">
                                                    <span className="bg-blue-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md">
                                                        Drop Here (Pos {i + 1})
                                                    </span>
                                                </div>
                                            )}

                                            {/* Header Controls Bar */}
                                            <div className="flex items-center justify-between mb-2 px-1 text-slate-500">
                                                <div className="flex items-center space-x-1.5 truncate">
                                                    <GripVertical size={16} className="text-slate-400 shrink-0" />
                                                    <span className="text-[11px] font-bold font-mono text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded">
                                                        #{i + 1}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[80px]" title={page.sourceFileName}>
                                                        {page.sourceFileName}
                                                    </span>
                                                </div>

                                                <div className="flex items-center space-x-1">
                                                    {/* Download Single Page Button */}
                                                    <button
                                                        onClick={() => downloadSinglePage(page, i)}
                                                        disabled={processing}
                                                        className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                        title="Download page ini saja"
                                                    >
                                                        <FileDown size={15} />
                                                    </button>

                                                    {/* Delete Page Button */}
                                                    <button
                                                        onClick={() => deletePage(i)}
                                                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                        title="Hapus page ini"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Page Thumbnail Preview */}
                                            <div className="relative aspect-[3/4] bg-white rounded-lg overflow-hidden border border-slate-200 flex justify-center items-center">
                                                <img
                                                    src={page.image}
                                                    alt={`Page ${i + 1}`}
                                                    className="w-full h-full object-contain p-1"
                                                />
                                            </div>

                                            {/* Footer Navigation Buttons */}
                                            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/60">
                                                <button
                                                    onClick={() => movePage(i, -1)}
                                                    disabled={i === 0}
                                                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                                    title="Geser Kiri"
                                                >
                                                    <ArrowLeft size={14} />
                                                </button>
                                                <span className="text-[10px] text-slate-400 uppercase font-semibold">
                                                    {page.isImage ? 'IMAGE' : 'PDF'}
                                                </span>
                                                <button
                                                    onClick={() => movePage(i, 1)}
                                                    disabled={i === pages.length - 1}
                                                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                                    title="Geser Kanan"
                                                >
                                                    <ArrowRight size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Actions & Logs */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-2">Summary & Export</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            Organize all your pages in the workspace into a single PDF document or export individual pages.
                        </p>

                        <div className="space-y-3 mb-6 text-sm bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <div className="flex justify-between text-slate-600">
                                <span>Total Pages:</span>
                                <span className="font-semibold text-slate-800">{pages.length}</span>
                            </div>
                            <div className="flex justify-between text-slate-600 text-xs">
                                <span>PDF Pages:</span>
                                <span>{pages.filter(p => !p.isImage).length}</span>
                            </div>
                            <div className="flex justify-between text-slate-600 text-xs">
                                <span>Image Pages:</span>
                                <span>{pages.filter(p => p.isImage).length}</span>
                            </div>
                        </div>

                        <button
                            onClick={exportAllPdf}
                            disabled={processing || pages.length === 0}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium flex justify-center items-center transition-all shadow-sm"
                        >
                            {processing ? <Loader2 className="animate-spin mr-2" /> : <Download className="mr-2" />}
                            {processing ? 'Processing...' : 'Download All (Merged PDF)'}
                        </button>
                    </div>

                    {logs.length > 0 && (
                        <div className="bg-slate-900 text-slate-300 p-4 rounded-xl text-xs font-mono h-40 overflow-y-auto">
                            {logs.map((log, i) => (
                                <div key={i}>{'>'} {log}</div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OrganizePdf;
