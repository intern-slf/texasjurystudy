import Link from 'next/link';
import React from 'react';

const Navbar: React.FC = () => {
  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100 sticky top-0 z-50">
      {/* Logo Section */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
          <span className="text-white font-bold text-xs">FG</span>
        </div>
        <Link href="/dashboard" className="text-xl font-bold tracking-tight text-black">
          FocusGroup
        </Link>
      </div>

      {/* Profile Section */}
      <div className="flex items-center">
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white text-xs font-medium cursor-pointer">
          N
        </div>
      </div>
    </nav>
  );
};

export default Navbar;