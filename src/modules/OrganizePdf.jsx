import React, { useState } from 'react';
import Dropzone from '../components/Dropzone';
import { saveAs } from 'file-saver';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, Download, Trash2, GripVertical, ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import { Reorder } from 'framer-motion';

const OrganizePdf = () => {
    const [mode, setMode] = useState('merge'); // 'merge' | 'edit'
    const [files, setFiles] = useState([]); // For merge: objects { id, name, type, file, buffer (opt) }
    const [editPages, setEditPages] = useState([]); // list of page previews
    const [activePdfName, setActivePdfName] = useState('');
    const [logs, setLogs] = useState([]);
    const [processing, setProcessing] = useState(false);

    const addLog = (msg) => setLogs(prev => [...prev, msg]);

    // --- Merge Logic ---
    const onDropMerge = (acceptedFiles) => {
        const newFiles = acceptedFiles.map(file => ({
            id: Math.random().toString(36),
            name: file.name,
            type: file.type,
            file: file,
            isImage: file.type.startsWith('image/')
        }));
        setFiles(prev => [...prev, ...newFiles]);
        addLog(`Added ${acceptedFiles.length} files.`);
    };

    const runMerge = async () => {
        if (files.length === 0) return;
        setProcessing(true);
        try {
            const mergedPdf = await PDFDocument.create();

            for (const item of files) {
                let buffer;
                if (item.file) buffer = await item.file.arrayBuffer();

                if (item.isImage) {
                    addLog(`Adding Image: ${item.name}`);
                    let img;
                    if (item.type === 'image/jpeg') img = await mergedPdf.embedJpg(buffer);
                    else if (item.type === 'image/png') img = await mergedPdf.embedPng(buffer);
                    else {
                        addLog(`Skipping unsupported image type: ${item.type}`);
                        continue;
                    }
                    const page = mergedPdf.addPage([img.width, img.height]);
                    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

                } else {
                    addLog(`Adding PDF: ${item.name}`);
                    const pdf = await PDFDocument.load(buffer);
                    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }
            }

            const pdfBytes = await mergedPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            saveAs(blob, 'merged.pdf');
            addLog("Merged PDF Saved!");
        } catch (e) {
            addLog(`Error: ${e.message}`);
        }
        setProcessing(false);
    };

    // --- Edit Logic ---
    const processEditFiles = async (acceptedFiles) => {
        setProcessing(true);

        // If first load, store name
        if (editPages.length === 0 && acceptedFiles.length > 0) {
            setActivePdfName(acceptedFiles[0].name.replace('.pdf', ''));
        }

        const newPages = [];

        for (const file of acceptedFiles) {
            const buffer = await file.arrayBuffer();

            if (file.type.includes('pdf')) {
                try {
                    const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
                    const pdfProxy = await loadingTask.promise;

                    for (let i = 1; i <= pdfProxy.numPages; i++) {
                        const page = await pdfProxy.getPage(i);
                        const viewport = page.getViewport({ scale: 0.3 });
                        const canvas = document.createElement('canvas');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

                        newPages.push({
                            id: Math.random().toString(36),
                            originalIndex: i - 1,
                            image: canvas.toDataURL(),
                            fileBuffer: buffer, // Keep ref to source
                            isImage: false
                        });
                    }
                    addLog(`Appended pages from ${file.name}`);
                } catch (e) {
                    addLog(`Error loading PDF ${file.name}: ${e.message}`);
                }
            } else if (file.type.startsWith('image/')) {
                // For Images, we display them directly
                // And we will treat them as a "page" that needs embedding later
                // Create a dummy canvas to standardize preview if needed, or just use blob url
                const imgUrl = URL.createObjectURL(file);
                newPages.push({
                    id: Math.random().toString(36),
                    originalIndex: 0,
                    image: imgUrl,
                    fileBuffer: buffer,
                    fileType: file.type,
                    isImage: true
                });
                addLog(`Appended image ${file.name}`);
            }
        }

        setEditPages(prev => [...prev, ...newPages]);
        setProcessing(false);
    };

    const movePageArrow = (index, direction) => {
        const newPages = [...editPages];
        if (direction === -1 && index > 0) { // Left
            [newPages[index], newPages[index - 1]] = [newPages[index - 1], newPages[index]];
        } else if (direction === 1 && index < newPages.length - 1) { // Right
            [newPages[index], newPages[index + 1]] = [newPages[index + 1], newPages[index]];
        }
        setEditPages(newPages);
    };

    const deletePageItem = (index) => {
        setEditPages(prev => prev.filter((_, i) => i !== index));
    };

    const runSaveEdit = async () => {
        if (editPages.length === 0) return;
        setProcessing(true);
        try {
            const newPdf = await PDFDocument.create();

            // Map buffer -> PDFDoc to avoid reloading same doc multiple times
            const docMap = new Map();

            for (const pageItem of editPages) {
                if (pageItem.isImage) {
                    // Embed Image
                    let img;
                    if (pageItem.fileType === 'image/jpeg') img = await newPdf.embedJpg(pageItem.fileBuffer);
                    else if (pageItem.fileType === 'image/png') img = await newPdf.embedPng(pageItem.fileBuffer);
                    else continue;

                    const page = newPdf.addPage([img.width, img.height]);
                    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

                } else {
                    // Copy PDF Page
                    let srcDoc = docMap.get(pageItem.fileBuffer);
                    if (!srcDoc) {
                        srcDoc = await PDFDocument.load(pageItem.fileBuffer);
                        docMap.set(pageItem.fileBuffer, srcDoc);
                    }
                    const [copiedPage] = await newPdf.copyPages(srcDoc, [pageItem.originalIndex]);
                    newPdf.addPage(copiedPage);
                }
            }

            const pdfBytes = await newPdf.save();
            saveAs(new Blob([pdfBytes], { type: 'application/pdf' }), `edited_${activePdfName || 'combined'}.pdf`);
            addLog("Edited PDF Saved!");

        } catch (e) {
            addLog(`Error saving: ${e.message}`);
        }
        setProcessing(false);
    };

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold text-slate-800">Organize PDF</h2>
                <div className="flex bg-slate-200 p-1 rounded-lg">
                    {['merge', 'edit'].map((m) => (
                        <button
                            key={m}
                            onClick={() => { setMode(m); setFiles([]); setEditPages([]); setLogs([]); }}
                            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-all ${mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                }`}
                        >
                            {m === 'edit' ? 'Edit Pages' : 'Merge Files'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {mode === 'merge' ? (
                        <>
                            <Dropzone onDrop={onDropMerge} accept={{ 'application/pdf': [], 'image/png': [], 'image/jpeg': [] }} />
                            {files.length > 0 && (
                                <Reorder.Group axis="y" values={files} onReorder={setFiles} className="space-y-2">
                                    {files.map((item) => (
                                        <Reorder.Item key={item.id} value={item} className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 flex items-center justify-between cursor-move hover:shadow-md transition-shadow">
                                            <div className="flex items-center space-x-3">
                                                <GripVertical className="text-slate-400" size={20} />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-700 truncate max-w-xs">{item.name}</span>
                                                    <span className="text-[10px] text-slate-400 uppercase">{item.isImage ? 'IMAGE' : 'PDF'}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => setFiles(prev => prev.filter(f => f.id !== item.id))} className="text-slate-400 hover:text-red-500">
                                                <Trash2 size={16} />
                                            </button>
                                        </Reorder.Item>
                                    ))}
                                </Reorder.Group>
                            )}
                        </>
                    ) : (
                        <>
                            {editPages.length === 0 ? (
                                <Dropzone onDrop={processEditFiles} accept={{ 'application/pdf': [], 'image/png': [], 'image/jpeg': [] }} multiple={true} />
                            ) : (
                                <div className="space-y-4">
                                    {/* Add More Button / Area */}
                                    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">
                                        <p className="text-xs text-slate-500 mb-2 font-medium">Add more pages (PDF/Image) to the end:</p>
                                        <Dropzone
                                            onDrop={processEditFiles}
                                            accept={{ 'application/pdf': [], 'image/png': [], 'image/jpeg': [] }}
                                            multiple={true}
                                            className="min-h-[80px] p-4 border-slate-300"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {editPages.map((page, i) => (
                                            <div key={page.id} className="relative group border border-slate-200 rounded-lg p-2 bg-slate-50">
                                                <img src={page.image} alt={`Page ${i + 1}`} className="w-full h-auto shadow-sm rounded border border-slate-200" />

                                                {/* Arrow Controls Overlay */}
                                                <div className="absolute inset-x-2 bottom-2 bg-white/90 p-1 flex justify-between items-center rounded shadow opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => movePageArrow(i, -1)} disabled={i === 0} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30 text-slate-700"><ArrowLeft size={14} /></button>
                                                    <span className="text-[10px] text-slate-500 font-mono">{i + 1}</span>
                                                    <button onClick={() => movePageArrow(i, 1)} disabled={i === editPages.length - 1} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30 text-slate-700"><ArrowRight size={14} /></button>
                                                </div>

                                                <button onClick={() => deletePageItem(i)} className="absolute top-1 right-1 p-1 bg-red-100 text-red-500 rounded-full opacity-100 sm:opacity-0 group-hover:opacity-100 hover:bg-red-200">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4 capitalize">{mode === 'merge' ? 'Merge Action' : 'Save Changes'}</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            {mode === 'merge'
                                ? "Combine PDFs and Images into a single PDF. Drag items to reorder."
                                : "Select PDFs/Images to extract and arrange pages. Use arrows to move pages."}
                        </p>

                        <button
                            onClick={mode === 'merge' ? runMerge : runSaveEdit}
                            disabled={processing || (mode === 'merge' ? files.length === 0 : editPages.length === 0)}
                            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium flex justify-center items-center transition-all"
                        >
                            {processing ? <Loader2 className="animate-spin mr-2" /> : <Download className="mr-2" />}
                            {processing ? 'Processing...' : (mode === 'merge' ? 'Merge Now' : 'Save PDF')}
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
