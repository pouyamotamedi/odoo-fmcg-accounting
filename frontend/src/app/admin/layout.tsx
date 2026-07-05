import Sidebar from '@/components/Sidebar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <main className="flex-1 bg-gray-50 p-6 overflow-auto print:p-0 print:bg-white">
        {children}
      </main>
    </div>
  );
}
