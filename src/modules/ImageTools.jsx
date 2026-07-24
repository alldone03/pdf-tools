import React, { useState, useEffect, useRef } from 'react';
import Dropzone from '../components/Dropzone';
import { saveAs } from 'file-saver';
import heic2any from 'heic2any';
import { Loader2, Download, Trash2, ArrowUp, ArrowDown, MoveHorizontal, MoveVertical, Eye, Layers, Clipboard } from 'lucide-react';

const ImageTools = () => {
    const [mode, setMode] = useState('convert'); // 'convert' | 'resize' | 'merge'
    const [files, setFiles] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [targetFormat, setTargetFormat] = useState('png');
    const [resizeDim, setResizeDim] = useState({ width: '', height: '' });
    const [logs, setLogs] = useState([]);

    // --- Merge & Compression States ---
    const [mergeDirection, setMergeDirection] = useState('horizontal'); // 'horizontal' | 'vertical'
    const [mergeSizing, setMergeSizing] = useState('match'); // 'match' | 'original' | 'custom'
    const [mergeCustomDim, setMergeCustomDim] = useState({ width: '', height: '' });
    const [mergeGap, setMergeGap] = useState(0);
    const [mergeBgColor, setMergeBgColor] = useState('#ffffff');
    const [mergeFormat, setMergeFormat] = useState('png');
    const [quality, setQuality] = useState(80); // Compression Quality 10% - 100%
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewSizeBytes, setPreviewSizeBytes] = useState(null);
    const [generatingPreview, setGeneratingPreview] = useState(false);

    const addLog = (msg) => setLogs(prev => [...prev, msg]);

    // Global Clipboard Paste Event Listener (CTRL+V)
    useEffect(() => {
        const handlePaste = (e) => {
            if (!e.clipboardData || !e.clipboardData.items) return;
            const items = e.clipboardData.items;
            const pastedFiles = [];

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.indexOf('image') !== -1) {
                    const blob = item.getAsFile();
                    if (blob) {
                        const ext = item.type.split('/')[1] || 'png';
                        const file = new File([blob], `pasted_image_${Date.now()}_${i + 1}.${ext}`, { type: item.type });
                        pastedFiles.push(file);
                    }
                }
            }

            if (pastedFiles.length > 0) {
                setFiles(prev => [...prev, ...pastedFiles]);
                addLog(`Pasted ${pastedFiles.length} image(s) from clipboard (CTRL+V).`);
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getTotalOriginalSize = () => {
        return files.reduce((sum, f) => sum + (f.size || 0), 0);
    };

    const onDrop = (acceptedFiles) => {
        setFiles(prev => [...prev, ...acceptedFiles]);
        addLog(`Added ${acceptedFiles.length} files.`);
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const moveFile = (index, delta) => {
        const newIndex = index + delta;
        if (newIndex < 0 || newIndex >= files.length) return;
        const updated = [...files];
        const [moved] = updated.splice(index, 1);
        updated.splice(newIndex, 0, moved);
        setFiles(updated);
    };

    const loadImageBitmap = async (file) => {
        let blob = file;
        if (file.name.toLowerCase().endsWith('.heic')) {
            blob = await heic2any({ blob: file, toType: "image/png" });
            if (Array.isArray(blob)) blob = blob[0];
        }
        return await createImageBitmap(blob);
    };

    const convertImage = async (file, format) => {
        try {
            let blob = file;
            if (file.name.toLowerCase().endsWith('.heic')) {
                addLog(`Converting HEIC: ${file.name}...`);
                blob = await heic2any({ blob: file, toType: "image/png" });
                if (Array.isArray(blob)) blob = blob[0];
            }

            const img = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
            const qRatio = quality / 100;

            return new Promise((resolve) => {
                canvas.toBlob((b) => {
                    resolve(b);
                }, mimeType, qRatio);
            });
        } catch (e) {
            console.error(e);
            addLog(`Error converting ${file.name}: ${e.message}`);
            return null;
        }
    };

    const resizeImage = async (file, w, h) => {
        try {
            let srcBlob = file;
            if (file.name.toLowerCase().endsWith('.heic')) {
                srcBlob = await heic2any({ blob: file, toType: "image/png" });
                if (Array.isArray(srcBlob)) srcBlob = srcBlob[0];
            }

            const img = await createImageBitmap(srcBlob);

            let newW = img.width;
            let newH = img.height;

            if (w && h) { newW = parseInt(w); newH = parseInt(h); }
            else if (w) { newW = parseInt(w); newH = Math.round((img.height / img.width) * newW); }
            else if (h) { newH = parseInt(h); newW = Math.round((img.width / img.height) * newH); }

            const canvas = document.createElement('canvas');
            canvas.width = newW;
            canvas.height = newH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, newW, newH);

            const mimeType = file.type === 'image/jpeg' ? 'image/jpeg' : file.type;
            const qRatio = quality / 100;

            return new Promise((resolve) => {
                canvas.toBlob((b) => resolve(b), mimeType, qRatio);
            });
        } catch (e) {
            addLog(`Error resizing ${file.name}: ${e.message}`);
            return null;
        }
    };

    // Helper to generate merged Canvas
    const generateMergedCanvas = async (filesList) => {
        if (!filesList || filesList.length === 0) return null;

        const images = [];
        for (const file of filesList) {
            try {
                const img = await loadImageBitmap(file);
                images.push(img);
            } catch (err) {
                console.error(`Failed to load ${file.name}`, err);
            }
        }

        if (images.length === 0) return null;

        let targetDimensions = [];

        if (mergeSizing === 'match') {
            if (mergeDirection === 'horizontal') {
                const baseHeight = images[0].height;
                targetDimensions = images.map(img => ({
                    width: Math.round(img.width * (baseHeight / img.height)),
                    height: baseHeight
                }));
            } else {
                const baseWidth = images[0].width;
                targetDimensions = images.map(img => ({
                    width: baseWidth,
                    height: Math.round(img.height * (baseWidth / img.width))
                }));
            }
        } else if (mergeSizing === 'custom') {
            const customW = parseInt(mergeCustomDim.width) || null;
            const customH = parseInt(mergeCustomDim.height) || null;
            targetDimensions = images.map(img => {
                let w = img.width;
                let h = img.height;
                if (customW && customH) {
                    w = customW;
                    h = customH;
                } else if (customW) {
                    w = customW;
                    h = Math.round((img.height / img.width) * customW);
                } else if (customH) {
                    h = customH;
                    w = Math.round((img.width / img.height) * customH);
                }
                return { width: w, height: h };
            });
        } else {
            // 'original'
            targetDimensions = images.map(img => ({ width: img.width, height: img.height }));
        }

        const gapPx = parseInt(mergeGap) || 0;
        let canvasW = 0;
        let canvasH = 0;

        if (mergeDirection === 'horizontal') {
            canvasW = targetDimensions.reduce((sum, d) => sum + d.width, 0) + gapPx * (images.length - 1);
            canvasH = Math.max(...targetDimensions.map(d => d.height));
        } else {
            canvasW = Math.max(...targetDimensions.map(d => d.width));
            canvasH = targetDimensions.reduce((sum, d) => sum + d.height, 0) + gapPx * (images.length - 1);
        }

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');

        if (mergeBgColor && mergeBgColor !== 'transparent') {
            ctx.fillStyle = mergeBgColor;
            ctx.fillRect(0, 0, canvasW, canvasH);
        }

        let currX = 0;
        let currY = 0;

        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const dim = targetDimensions[i];

            if (mergeDirection === 'horizontal') {
                const offsetY = Math.round((canvasH - dim.height) / 2);
                ctx.drawImage(img, currX, offsetY, dim.width, dim.height);
                currX += dim.width + gapPx;
            } else {
                const offsetX = Math.round((canvasW - dim.width) / 2);
                ctx.drawImage(img, offsetX, currY, dim.width, dim.height);
                currY += dim.height + gapPx;
            }
        }

        return canvas;
    };

    // Live preview & size estimation effect
    useEffect(() => {
        if (files.length === 0) {
            setPreviewUrl(null);
            setPreviewSizeBytes(null);
            return;
        }

        let isCancelled = false;
        setGeneratingPreview(true);

        const timer = setTimeout(async () => {
            try {
                if (mode === 'merge') {
                    const canvas = await generateMergedCanvas(files);
                    if (canvas && !isCancelled) {
                        const mimeType = mergeFormat === 'jpg' ? 'image/jpeg' : `image/${mergeFormat}`;
                        canvas.toBlob((blob) => {
                            if (blob && !isCancelled) {
                                if (previewUrl) URL.revokeObjectURL(previewUrl);
                                setPreviewUrl(URL.createObjectURL(blob));
                                setPreviewSizeBytes(blob.size);
                            }
                            setGeneratingPreview(false);
                        }, mimeType, quality / 100);
                    } else {
                        if (!isCancelled) setGeneratingPreview(false);
                    }
                } else {
                    // For convert / resize: estimate output size using first file sample
                    const sampleFile = files[0];
                    let blob = null;
                    if (mode === 'convert') {
                        blob = await convertImage(sampleFile, targetFormat);
                    } else {
                        blob = await resizeImage(sampleFile, resizeDim.width, resizeDim.height);
                    }
                    if (blob && !isCancelled) {
                        setPreviewSizeBytes(blob.size);
                    }
                    setGeneratingPreview(false);
                }
            } catch (e) {
                console.error("Preview/Size calculation error", e);
                if (!isCancelled) setGeneratingPreview(false);
            }
        }, 300);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [mode, files, mergeDirection, mergeSizing, mergeCustomDim, mergeGap, mergeBgColor, mergeFormat, targetFormat, resizeDim, quality]);

    const handleProcess = async () => {
        if (files.length === 0) return;
        setProcessing(true);
        setLogs([]);

        if (mode === 'merge') {
            addLog(`Generating merged image (${mergeDirection})...`);
            try {
                const canvas = await generateMergedCanvas(files);
                if (canvas) {
                    const mimeType = mergeFormat === 'jpg' ? 'image/jpeg' : `image/${mergeFormat}`;
                    canvas.toBlob((blob) => {
                        if (blob) {
                            saveAs(blob, `merged_image_${Date.now()}.${mergeFormat}`);
                            addLog(`Successfully saved merged image as .${mergeFormat}!`);
                        } else {
                            addLog(`Failed to export merged image.`);
                        }
                        setProcessing(false);
                    }, mimeType, quality / 100);
                } else {
                    addLog(`Error creating canvas for merge.`);
                    setProcessing(false);
                }
            } catch (err) {
                addLog(`Merge error: ${err.message}`);
                setProcessing(false);
            }
            return;
        }

        let processedCount = 0;
        for (const file of files) {
            addLog(`Processing ${file.name}...`);
            let resultBlob = null;
            let ext = targetFormat;

            if (mode === 'convert') {
                resultBlob = await convertImage(file, targetFormat);
            } else if (mode === 'resize') {
                resultBlob = await resizeImage(file, resizeDim.width, resizeDim.height);
                ext = file.name.split('.').pop();
            }

            if (resultBlob) {
                const newName = file.name.substring(0, file.name.lastIndexOf('.')) + (mode === 'resize' ? '_resized' : '') + '.' + ext;
                saveAs(resultBlob, newName);
                processedCount++;
            }
        }

        addLog(`Done! Processed ${processedCount} files.`);
        setProcessing(false);
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold text-slate-800">Image Tools</h2>
                <div className="flex bg-slate-200 p-1 rounded-lg">
                    {['convert', 'resize', 'merge'].map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-all ${mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Dropzone & File List & Live Preview */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="space-y-2">
                        <Dropzone onDrop={onDrop} accept={{ 'image/*': [] }} />
                        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 bg-blue-50/60 border border-blue-100 rounded-lg p-2.5">
                            <Clipboard size={14} className="text-blue-600 shrink-0" />
                            <span>Use <kbd className="px-1.5 py-0.5 bg-white text-slate-800 font-semibold font-mono border border-slate-300 rounded shadow-xs text-[11px]">CTRL + V</kbd> to paste an image directly from your clipboard!</span>
                        </div>
                    </div>

                    {files.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                <span className="font-medium text-slate-700">{files.length} Files Selected</span>
                                <button onClick={() => setFiles([])} className="text-red-500 text-xs hover:underline">Clear All</button>
                            </div>
                            <ul className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                                {files.map((file, i) => (
                                    <li key={i} className="px-4 py-2 flex justify-between items-center text-sm">
                                        <div className="flex items-center space-x-2 truncate">
                                            <span className="font-semibold text-slate-400 w-5">{i + 1}.</span>
                                            <span className="truncate text-slate-600">{file.name}</span>
                                        </div>
                                        <div className="flex items-center space-x-1">
                                            {mode === 'merge' && (
                                                <>
                                                    <button
                                                        onClick={() => moveFile(i, -1)}
                                                        disabled={i === 0}
                                                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                                        title="Move Up"
                                                    >
                                                        <ArrowUp size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => moveFile(i, 1)}
                                                        disabled={i === files.length - 1}
                                                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                                        title="Move Down"
                                                    >
                                                        <ArrowDown size={16} />
                                                    </button>
                                                </>
                                            )}
                                            <button onClick={() => removeFile(i)} className="p-1 text-slate-400 hover:text-red-500" title="Remove">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Live Preview Container for Merge Mode */}
                    {mode === 'merge' && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <Eye size={18} className="text-blue-600" />
                                    Live Merge Preview
                                </h3>
                                {generatingPreview && (
                                    <span className="text-xs text-blue-600 flex items-center gap-1">
                                        <Loader2 size={14} className="animate-spin" /> Rendering preview...
                                    </span>
                                )}
                            </div>

                            {files.length === 0 ? (
                                <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
                                    Upload images above to see the live merged preview here.
                                </div>
                            ) : previewUrl ? (
                                <div className="border border-slate-200 rounded-lg p-2 bg-slate-100 flex justify-center items-center max-h-96 overflow-auto">
                                    <img
                                        src={previewUrl}
                                        alt="Merged Preview"
                                        className="max-w-full h-auto object-contain rounded shadow-sm"
                                    />
                                </div>
                            ) : (
                                <div className="border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
                                    {generatingPreview ? 'Generating preview...' : 'No preview available.'}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Column: Settings */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4 capitalize">{mode} Settings</h3>

                        {mode === 'convert' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Target Format</label>
                                    <select
                                        value={targetFormat}
                                        onChange={(e) => setTargetFormat(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="png">PNG</option>
                                        <option value="jpg">JPG</option>
                                        <option value="webp">WEBP</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {mode === 'resize' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">Width</label>
                                        <input
                                            type="number"
                                            placeholder="Auto"
                                            value={resizeDim.width}
                                            onChange={(e) => setResizeDim({ ...resizeDim, width: e.target.value })}
                                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">Height</label>
                                        <input
                                            type="number"
                                            placeholder="Auto"
                                            value={resizeDim.height}
                                            onChange={(e) => setResizeDim({ ...resizeDim, height: e.target.value })}
                                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400">Leave one blank to preserve aspect ratio.</p>
                            </div>
                        )}

                        {mode === 'merge' && (
                            <div className="space-y-5">
                                {/* Direction selector */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-2">Direction (Penggabungan)</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMergeDirection('horizontal')}
                                            className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all ${mergeDirection === 'horizontal'
                                                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                                                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                                }`}
                                        >
                                            <MoveHorizontal size={16} />
                                            Horizontal
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMergeDirection('vertical')}
                                            className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all ${mergeDirection === 'vertical'
                                                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                                                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                                }`}
                                        >
                                            <MoveVertical size={16} />
                                            Vertikal (Stack)
                                        </button>
                                    </div>
                                </div>

                                {/* Dimension Sizing options */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Ukuran Dimensi Gambar</label>
                                    <select
                                        value={mergeSizing}
                                        onChange={(e) => setMergeSizing(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    >
                                        <option value="match">
                                            {mergeDirection === 'horizontal' ? 'Samakan Tinggi (Match Height)' : 'Samakan Lebar (Match Width)'}
                                        </option>
                                        <option value="original">Ukuran Asli (Original Dimensions)</option>
                                        <option value="custom">Custom Dimensions</option>
                                    </select>
                                </div>

                                {mergeSizing === 'custom' && (
                                    <div className="grid grid-cols-2 gap-3 pl-2 border-l-2 border-blue-200">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Width (px)</label>
                                            <input
                                                type="number"
                                                placeholder="Auto"
                                                value={mergeCustomDim.width}
                                                onChange={(e) => setMergeCustomDim({ ...mergeCustomDim, width: e.target.value })}
                                                className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Height (px)</label>
                                            <input
                                                type="number"
                                                placeholder="Auto"
                                                value={mergeCustomDim.height}
                                                onChange={(e) => setMergeCustomDim({ ...mergeCustomDim, height: e.target.value })}
                                                className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Spacing/Gap & Background */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">Gap / Spacing (px)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={mergeGap}
                                            onChange={(e) => setMergeGap(Math.max(0, parseInt(e.target.value) || 0))}
                                            className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">Background</label>
                                        <select
                                            value={mergeBgColor}
                                            onChange={(e) => setMergeBgColor(e.target.value)}
                                            className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="#ffffff">Putih (White)</option>
                                            <option value="#000000">Hitam (Black)</option>
                                            <option value="transparent">Transparan</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Output Format */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Output Format</label>
                                    <select
                                        value={mergeFormat}
                                        onChange={(e) => setMergeFormat(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="png">PNG</option>
                                        <option value="jpg">JPG</option>
                                        <option value="webp">WEBP</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Compression Quality Slider (Applies to all modes) */}
                        <div className="mt-5 pt-5 border-t border-slate-100 space-y-2">
                            <div className="flex justify-between items-center text-sm font-medium text-slate-700">
                                <span>Compression Quality</span>
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">{quality}%</span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="100"
                                step="5"
                                value={quality}
                                onChange={(e) => setQuality(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <div className="flex justify-between text-[11px] text-slate-400">
                                <span>10% (Smaller Size)</span>
                                <span>100% (Best Quality)</span>
                            </div>
                        </div>

                        {/* Estimated File Size Card */}
                        {files.length > 0 && (
                            <div className="mt-5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                                <div className="font-semibold text-slate-700 flex justify-between items-center border-b border-slate-200 pb-1.5">
                                    <span>Estimasi Ukuran File</span>
                                    {generatingPreview && <Loader2 size={12} className="animate-spin text-blue-600" />}
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>Ukuran Asli Total:</span>
                                    <span className="font-mono font-medium">{formatBytes(getTotalOriginalSize())}</span>
                                </div>
                                <div className="flex justify-between text-slate-800 font-semibold">
                                    <span>Perkiraan Hasil ({mode === 'merge' ? mergeFormat.toUpperCase() : targetFormat.toUpperCase()}):</span>
                                    <span className="font-mono text-blue-600">{previewSizeBytes ? formatBytes(previewSizeBytes) : 'Menghitung...'}</span>
                                </div>
                                {previewSizeBytes && getTotalOriginalSize() > 0 && (
                                    <div className="flex justify-between items-center pt-1 border-t border-slate-200 text-[11px]">
                                        <span className="text-slate-500">Perubahan Ukuran:</span>
                                        <span className={`font-bold ${previewSizeBytes <= getTotalOriginalSize() ? 'text-emerald-600' : 'text-amber-600'}`}>
                                            {previewSizeBytes <= getTotalOriginalSize() ? 'Hemat ' : 'Bertambah '}
                                            {Math.abs(Math.round(((previewSizeBytes - getTotalOriginalSize()) / getTotalOriginalSize()) * 100))}%
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleProcess}
                            disabled={processing || files.length === 0}
                            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium flex justify-center items-center transition-all shadow-sm"
                        >
                            {processing ? <Loader2 className="animate-spin mr-2" /> : <Download className="mr-2" />}
                            {processing ? 'Processing...' : mode === 'merge' ? 'Merge & Download' : 'Start Processing'}
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

export default ImageTools;

