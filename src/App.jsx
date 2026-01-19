import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ImageTools from './modules/ImageTools';
import PdfTools from './modules/PdfTools';
import OrganizePdf from './modules/OrganizePdf';
import SignPdf from './modules/SignPdf';

function App() {
  const [activeTab, setActiveTab] = useState('image');

  const renderContent = () => {
    switch (activeTab) {
      case 'image': return <ImageTools />;
      case 'pdf': return <PdfTools />;
      case 'organize': return <OrganizePdf />;
      case 'sign': return <SignPdf />;
      default: return <ImageTools />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
