import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Camera, Image as ImageIcon, Video, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pt-20">
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 pb-24">
        <div className="text-center space-y-8 max-w-2xl mx-auto py-16">
          <div className="inline-flex items-center justify-center p-4 bg-primary/5 rounded-2xl mb-4">
            <Camera className="w-12 h-12 text-primary" />
          </div>
          
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900">
            Private Event <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
              Photo Drop
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-600">
            A self-hosted, secure way to collect photos and videos from your guests. 
            No cloud storage fees, no public links, zero privacy concerns.
          </p>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="rounded-full shadow-lg" asChild>
              <Link href="/admin">
                Open Dashboard
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-full bg-white" asChild>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                Learn More
              </a>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 max-w-4xl mx-auto">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center space-y-4">
            <div className="bg-blue-50 p-3 rounded-full text-blue-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg">100% Private</h3>
            <p className="text-slate-500 text-sm">Files are saved directly to local storage and never touch public CDNs.</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center space-y-4">
            <div className="bg-green-50 p-3 rounded-full text-green-600">
              <ImageIcon className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg">Full Resolution</h3>
            <p className="text-slate-500 text-sm">Collect the original, uncompressed high-quality assets from mobile phones.</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center space-y-4">
            <div className="bg-purple-50 p-3 rounded-full text-purple-600">
              <Video className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg">No Size Limits</h3>
            <p className="text-slate-500 text-sm">Stream giant video files directly to disk without bloating server memory.</p>
          </div>
        </div>
      </main>
      
      <footer className="w-full border-t border-slate-200 bg-white py-8 text-center text-sm text-slate-500">
        <p>Built for your private events.</p>
      </footer>
    </div>
  );
}
