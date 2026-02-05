import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="w-full py-6 px-6 bg-white border-t border-gray-100 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} FocusGroup. All rights reserved.</p>
        <div className="flex gap-4 mt-2 md:mt-0">
          <a href="#" className="hover:text-black">Privacy</a>
          <a href="#" className="hover:text-black">Terms</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;