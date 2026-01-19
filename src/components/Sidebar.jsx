import React from 'react';
import { Image, FileText, Layers, PenTool } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab }) => {
    const menuItems = [
        { id: 'image', icon: Image, label: 'Image Tools' },
        { id: 'pdf', icon: FileText, label: 'PDF Tools' },
        { id: 'organize', icon: Layers, label: 'Organize PDF' },
        { id: 'sign', icon: PenTool, label: 'Sign PDF' },
    ];

    return (
        <div className="w-64 bg-slate-900 text-white min-h-screen p-4 flex flex-col shadow-lg">
            <div className="mb-8 px-2 pt-2">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Unified Tools
                </h1>
                <p className="text-xs text-slate-400 mt-1">Web Edition</p>
            </div>

            <nav className="flex-1 space-y-2">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === item.id
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                    >
                        <item.icon size={20} />
                        <span className="font-medium">{item.label}</span>
                    </button>
                ))}
            </nav>

            <div className="text-center py-4 border-t border-slate-800 text-xs text-slate-500">
                © 2026 Unified Tools
            </div>
        </div>
    );
};

export default Sidebar;
