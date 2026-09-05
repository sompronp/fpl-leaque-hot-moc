"use client";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../app/firebase";

// --- กำหนด Constants และ Types ที่หายไป ---
const ADMIN_EMAIL = "admin@example.com"; // เปลี่ยนเป็น Email Admin ของคุณ
const REQUIRED_COLUMNS = [
  "Rank",
  "Team",
  "Manager",
  "Score(GW)",
  "Hits",
  "Net Score",
  "Total",
  "Captain",
  "FPL ID",
];

interface TeamPreview {
  rank: number;
  teamName: string;
  managerName: string;
  scoreGW: number;
  hits: number;
  netScore: number;
  totalPoints: number;
  captain: string;
  fplId: string;
}
// ------------------------------------

export default function ImportExcelPage() {
  const [fileName, setFileName] = useState("");
  const [gameweek, setGameweek] = useState("2");
  const [teams, setTeams] = useState<TeamPreview[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  async function handleGoogleLogin() {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google login error:", error);
      setPublishMessage(
        "Login ไม่สำเร็จ กรุณาตรวจว่าเปิด Google Sign-In และเพิ่มโดเมน Vercel ใน Firebase Authentication → Authorized domains แล้ว"
      );
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setPublishMessage("");
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };

      reader.onerror = () => {
        reject(new Error("ไม่สามารถอ่านไฟล์เพื่อ Publish ได้"));
      };

      reader.readAsDataURL(file);
    });
  }

  async function handlePublishToFirebase() {
    if (!selectedFile || !teams.length) {
      setPublishMessage(
        "กรุณาเลือกไฟล์ Excel และรอให้ Preview ข้อมูลสำเร็จก่อน"
      );
      return;
    }

    if (!user) {
      setPublishMessage("กรุณา Login ด้วยบัญชี Admin ก่อน Publish");
      return;
    }

    if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      setPublishMessage(
        `บัญชี ${user.email} ไม่มีสิทธิ์ Publish กรุณา Login ด้วยบัญชี Admin`
      );
      return;
    }

    try {
      setPublishing(true);
      setPublishMessage("กำลังส่งไฟล์ Excel ไปประมวลผลและบันทึกใน Firebase...");

      const fileBase64 = await fileToBase64(selectedFile);

      const publishGameweekExcel = httpsCallable<
        {
          gameweek: number;
          fileName: string;
          fileBase64: string;
        },
        {
          success: boolean;
          message: string;
          gameweek: number;
          teamCount: number;
        }
      >(functions, "publishGameweekExcel");

      const result = await publishGameweekExcel({
        gameweek: Number(gameweek),
        fileName: selectedFile.name,
        fileBase64,
      });

      const data = result.data;

      setPublishMessage(
        `สำเร็จ: ${data.message} — บันทึก ${data.teamCount} ทีมแล้ว หน้า Dashboard จะดึง GW ล่าสุดอัตโนมัติ`
      );
    } catch (error: unknown) {
      console.error("Publish error:", error);
      const firebaseError = error as { code?: string; message?: string };
      setPublishMessage(
        `Publish ไม่สำเร็จ: ${
          firebaseError.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
        }`
      );
    } finally {
      setPublishing(false);
    }
  }

  const summary = useMemo(() => {
    const scores = teams.map((team) => team.scoreGW);
    return {
      teamCount: teams.length,
      highestScore: scores.length ? Math.max(...scores) : 0,
      averageScore: scores.length
        ? scores.reduce((total, score) => total + score, 0) / scores.length
        : 0,
    };
  }, [teams]);

  function text(value: unknown) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function number(value: unknown) {
    if (typeof value === "number") return value;
    const cleaned = text(value).replace(/,/g, "").replace(/[£$]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setTeams([]);
    setErrorMessage("");
    setSuccessMessage("");
    setSelectedFile(null);
    setPublishMessage("");

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setErrorMessage("กรุณาเลือกไฟล์ Excel ที่เป็น .xlsx");
      return;
    }

    setSelectedFile(file);
    setFileName(file.name);

    const gwMatch = file.name.match(/GW[\s_-]?(\d+)/i);
    if (gwMatch?.[1]) setGameweek(gwMatch[1]);

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const data = loadEvent.target?.result;
        if (!data) throw new Error("ไม่สามารถอ่านไฟล์ได้");

        const workbook = XLSX.read(data, { type: "array" });
        const sheetName =
          workbook.SheetNames.find(
            (name) => name.trim().toLowerCase() === "league"
          ) ?? workbook.SheetNames[0];

        if (!sheetName) throw new Error("ไม่พบ Sheet ในไฟล์ Excel");

        const worksheet = workbook.Sheets[sheetName];
        
        // --- แก้ไขวงเล็บที่หายไป ---
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          worksheet,
          { defval: "" }
        );

        if (!rows.length) {
          throw new Error("ไม่พบข้อมูลใน Sheet");
        }

        const columns = Object.keys(rows[0]);
        const missingColumns = REQUIRED_COLUMNS.filter(
          (column) => !columns.includes(column)
        );

        if (missingColumns.length > 0) {
          throw new Error(`ไม่พบคอลัมน์สำคัญ: ${missingColumns.join(", ")}`);
        }

        // --- แก้ไขการลบโค้ดบล็อกที่ซ้ำซ้อนทิ้งไป ---
        const parsedTeams = rows
          .map((row) => ({
            rank: number(row["Rank"]),
            teamName: text(row["Team"]),
            managerName: text(row["Manager"]),
            scoreGW: number(row["Score(GW)"]),
            hits: number(row["Hits"]),
            netScore: number(row["Net Score"]),
            totalPoints: number(row["Total"]),
            captain: text(row["Captain"]),
            fplId: text(row["FPL ID"]),
          }))
          .filter((team) => team.fplId && team.teamName)
          .sort((a, b) => a.rank - b.rank);

        if (!parsedTeams.length) {
          throw new Error("ไม่พบข้อมูลทีมที่ใช้งานได้");
        }

        setTeams(parsedTeams);
        setSuccessMessage(
          `อ่านไฟล์สำเร็จ: ${parsedTeams.length} ทีม จาก Sheet "${sheetName}"`
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดระหว่างอ่านไฟล์ Excel"
        );
      }
    };
    reader.readAsArrayBuffer(file);
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        กำลังตรวจสอบสิทธิ์ผู้ดูแล...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-sm font-semibold tracking-[0.2em] text-cyan-400">
            FPL LEAQUE HOT MOC
          </p>
          <h1 className="mt-3 text-2xl font-bold">Admin Login Required</h1>
          <p className="mt-3 text-sm text-slate-400">
            หน้านี้ใช้สำหรับ Import และ Publish Excel เข้า Firebase เท่านั้น
          </p>
          <button
            onClick={handleGoogleLogin}
            className="mt-6 w-full rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-400"
          >
            Sign in with Google
          </button>
          {publishMessage && (
            <p className="mt-4 text-sm text-rose-300">{publishMessage}</p>
          )}
        </section>
      </main>
    );
  }

  if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <section className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-rose-500/10 p-8 text-center">
          <h1 className="text-2xl font-bold text-rose-300">ไม่มีสิทธิ์เข้าถึง</h1>
          <p className="mt-3 text-sm text-slate-300">
            Google Account นี้ไม่ได้รับสิทธิ์เป็นผู้ดูแล
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Login อยู่ด้วย: {user.email}
          </p>
          <button
            onClick={handleLogout}
            className="mt-6 rounded-lg border border-slate-500 px-5 py-3 text-sm font-semibold hover:bg-slate-800"
          >
            Logout และเปลี่ยนบัญชี
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <p className="text-sm font-semibold tracking-[0.2em] text-cyan-400">
            FPL LEAQUE HOT MOC · ADMIN
          </p>
          <h1 className="mt-2 text-3xl font-bold">Import Excel Gameweek</h1>
          <p className="mt-2 text-slate-400">
            เลือกไฟล์ LiveFPL เพื่อตรวจสอบข้อมูลก่อน Publish เข้า Firebase
          </p>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid gap-5 md:grid-cols-[1fr_180px]">
            <div>
              <label className="text-sm font-semibold">
                เลือกไฟล์ Excel (.xlsx)
              </label>
              <input
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                className="mt-2 block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-cyan-500 file:px-4 file:py-2 file:font-semibold file:text-slate-950"
              />
              <p className="mt-2 text-xs text-slate-500">
                ระบบจะเลือก Sheet ชื่อ League ก่อน หากไม่มีจะเลือก Sheet แรก
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold">Gameweek</label>
              <input
                type="number"
                min="1"
                value={gameweek}
                onChange={(event) => setGameweek(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
              />
              <p className="mt-2 text-xs text-slate-500">
                อ่านจากชื่อไฟล์ เช่น GW2 อัตโนมัติ
              </p>
            </div>
          </div>
          {fileName && (
            <p className="mt-5 rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm">
              ไฟล์ที่เลือก: <strong className="text-cyan-300">{fileName}</strong>
            </p>
          )}
          {errorMessage && (
            <p className="mt-5 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
              {errorMessage}
            </p>
          )}
          {successMessage && (
            <p className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              {successMessage}
            </p>
          )}
        </div>
        <div className="mt-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="font-bold text-cyan-300">
                พร้อม Publish ข้อมูล GW {gameweek}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                ระบบจะเก็บ Excel ไว้ใน Firebase Storage และบันทึกทีม ผู้เล่น และ Ownership ลง Firestore
              </p>
            </div>
            <button
              onClick={handlePublishToFirebase}
              disabled={publishing}
              className="rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing
                ? "กำลัง Publish..."
                : `Publish GW ${gameweek} to Firebase`}
            </button>
          </div>
          {publishMessage && (
            <p className="mt-4 rounded-lg bg-slate-950 p-3 text-sm text-slate-200">
              {publishMessage}
            </p>
          )}
        </div>
        {teams.length > 0 && (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {/* --- แก้ไข Syntax String Template ให้ถูกต้อง --- */}
              <SummaryCard
                label="จำนวนทีม"
                value={`${summary.teamCount} ทีม`}
              />
              <SummaryCard
                label="คะแนน GW สูงสุด"
                value={String(summary.highestScore)}
              />
              <SummaryCard
                label="คะแนน GW เฉลี่ย"
                value={summary.averageScore.toFixed(1)}
              />
            </div>
            <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 p-6">
                <h2 className="text-xl font-bold">
                  Preview ตารางคะแนน — GW {gameweek}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  ข้อมูลนี้ยังเป็น Preview เท่านั้น ยังไม่ได้บันทึกลง Firebase
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-5 py-4">Rank</th>
                      <th className="px-5 py-4">Team</th>
                      <th className="px-5 py-4">Manager</th>
                      <th className="px-5 py-4 text-right">GW</th>
                      <th className="px-5 py-4 text-right">Net</th>
                      <th className="px-5 py-4 text-right">Total</th>
                      <th className="px-5 py-4">Captain</th>
                      <th className="px-5 py-4">FPL ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team) => (
                      <tr
                        key={team.fplId}
                        className="border-t border-slate-800 hover:bg-slate-800/40"
                      >
                        <td className="px-5 py-4 font-bold text-cyan-400">
                          {team.rank}
                        </td>
                        <td className="px-5 py-4 font-semibold">
                          {team.teamName}
                        </td>
                        <td className="px-5 py-4 text-slate-400">
                          {team.managerName || "-"}
                        </td>
                        <td className="px-5 py-4 text-right">{team.scoreGW}</td>
                        <td className="px-5 py-4 text-right">{team.netScore}</td>
                        <td className="px-5 py-4 text-right font-bold">
                          {team.totalPoints}
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-xs text-cyan-300">
                            {team.captain || "-"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">
                          {team.fplId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}
