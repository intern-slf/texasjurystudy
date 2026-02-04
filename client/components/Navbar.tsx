import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex-shrink-0">
            <Link href="/" className="text-2xl font-bold tracking-tight">
              FocusGroup
            </Link>
          </div>
          
          <div className="hidden md:flex space-x-4 items-center">
            <Link href="/auth/login" className="text-sm font-medium hover:text-gray-600">
              Log in
            </Link>
            <Link 
              href="/auth/signup?role=participant" 
              className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Join as Participant
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}