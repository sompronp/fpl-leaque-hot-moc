'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

type AppConfig = {
  appName?: string;
  leagueId?: string;
  season?: string;
  currentGameweek?: number;
  isPublic?: boolean;
};

export default function Home() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  async function loadFirebaseConfig() {
    setLoading(true);
    setErrorMessage('');

    try {
      const snapshot = await getDoc(doc(db, 'appConfig', 'public'));

      if (!snapshot.exists()) {
        setErrorMessage(
          'เชื่อม Firebase ได้ แต่ไม่พบ Document appConfig/public'
        );
        return;
      }

      setConfig(snapshot.data() as AppConfig);
    } catch (error) {
      console.error('Firebase error:', error);
      setErrorMessage(
        'โหลดข้อมูลจาก Firebase ไม่สำเร็จ กรุณาตรวจ Firestore Rules และ Firebase Config'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFirebaseConfig();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        กำลังโหลดข้อมูลจาก Firebase...
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
          <h1 className="text-xl font-bold text-rose-300">
            Firebase Connection Error
          </h1>
          <p className="mt-3 text-slate-300">{errorMessage}</p>
          <button
            onClick={loadFirebaseConfig}
            className="mt-5 rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950"
          >
            ลองใหม่
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-sm font-semibold tracking-[0.2em] text-cyan-400">
            FANTASY PREMIER LEAGUE
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            {config?.appName || 'FPL Leaque HOT MOC'}
          </h1>
          <p className="mt-2 text-slate-400">
            ตารางคะแนนและการวิเคราะห์ Mini League ล่าสุด
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-5 md:grid-cols-4">
          <StatCard
            label="Gameweek ล่าสุด"
            value={`GW ${config?.currentGameweek ?? '-'}`}
            detail="ดึงจาก Firestore"
          />
          <StatCard
            label="League ID"
            value={config?.leagueId || '-'}
            detail="Firebase league identifier"
          />
          <StatCard
            label="Season"
            value={config?.season || '-'}
            detail="ฤดูกาลที่กำลังติดตาม"
          />
          <StatCard
            label="สถานะ Public"
            value={config?.isPublic ? 'เปิดดูได้' : 'ปิด'}
            detail="ไม่ต้อง Login เพื่อดูข้อมูล"
          />
        </div>

        <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
          <h2 className="text-xl font-bold text-emerald-300">
            Firebase เชื่อมต่อสำเร็จ
          </h2>
          <p className="mt-2 text-slate-300">
            กำลังอ่านข้อมูลจาก Firestore ที่{' '}
            <code className="rounded bg-slate-800 px-2 py-1 text-cyan-300">
              appConfig/public
            </code>
          </p>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
