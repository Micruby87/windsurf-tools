import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Github,
  Heart,
  MessageSquare,
  ShieldCheck,
  UserCircle2,
  Users,
  X,
  ZoomIn,
} from "lucide-react";
import LegalDisclaimer from "../components/LegalDisclaimer";
import { APP_VERSION, REPO_URL } from "../utils/appMeta";
import { APP_PRODUCT_NAME, APP_PRODUCT_TAGLINE } from "../utils/appMode";
import { showToast } from "../utils/toast";

import authorWechatImg from "../assets/contact/author-wechat.jpg";
import sponsorQrImg from "../assets/contact/sponsor-qr.jpg";
import wechatGroup1 from "../assets/contact/wechat-group-1.jpg";
import wechatGroup2 from "../assets/contact/wechat-group-2.jpg";
import wechatGroup3 from "../assets/contact/wechat-group-3.jpg";

const GROUP_IMAGES = [wechatGroup1, wechatGroup2, wechatGroup3];

export default function About() {
  const [groupIndex, setGroupIndex] = useState(0);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxLabel, setLightboxLabel] = useState("");

  const openLightbox = (img: string, label: string) => {
    setLightboxImg(img);
    setLightboxLabel(label);
  };

  const cycleGroup = () =>
    setGroupIndex((prev) => (prev + 1) % GROUP_IMAGES.length);

  const copyWechatID = async () => {
    try {
      await navigator.clipboard.writeText("Seven77078");
      showToast("已复制微信号: Seven77078", "success");
    } catch {
      showToast("复制失败，请手动记下: Seven77078", "warning");
    }
  };

  const openGithub = () => window.open(REPO_URL, "_blank", "noopener");
  const currentGroupImg = GROUP_IMAGES[groupIndex]!;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto w-full pb-12">
      <header className="flex flex-col items-center text-center mb-10">
        <div className="w-24 h-24 rounded-ios-card bg-gradient-to-br from-ios-blue to-violet-500 text-white flex items-center justify-center shadow-[0_16px_40px_rgba(37,99,235,0.32)] mb-5">
          <ShieldCheck className="h-12 w-12" strokeWidth={2.4} />
        </div>
        <h1 className="text-[32px] font-bold text-ios-text dark:text-ios-textDark tracking-tight">
          {APP_PRODUCT_NAME}
        </h1>
        <p className="mt-2 text-[14px] text-gray-500 dark:text-gray-400 font-medium">
          v{APP_VERSION} · {APP_PRODUCT_TAGLINE}
        </p>
        <div className="mt-4 flex gap-2 flex-wrap justify-center">
          <button
            type="button"
            className="no-drag-region inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.12] text-[13px] font-bold text-gray-800 dark:text-gray-200 transition-all ios-btn"
            onClick={openGithub}
          >
            <Github className="w-4 h-4" strokeWidth={2.4} />
            仓库 / Issues
          </button>
          <button
            type="button"
            className="no-drag-region inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ios-blue/10 hover:bg-ios-blue/15 text-[13px] font-bold text-ios-blue transition-all ios-btn"
            onClick={copyWechatID}
          >
            <MessageSquare className="w-4 h-4" strokeWidth={2.4} />
            复制微信号 Seven77078
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* 作者微信 */}
        <div className="rounded-[22px] border border-black/[0.05] dark:border-white/[0.06] bg-white dark:bg-white/[0.04] p-5 flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-2xl bg-ios-blue/15 text-ios-blue flex items-center justify-center mb-3">
            <UserCircle2 className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <h3 className="text-[15px] font-bold text-ios-text dark:text-ios-textDark mb-1">
            作者微信
          </h3>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mb-3">
            技术交流 / 反馈 / 协作
          </p>
          <button
            type="button"
            className="no-drag-region group relative w-full max-w-[200px] rounded-ios-block overflow-hidden bg-white dark:bg-white/[0.06] shadow-md ring-1 ring-black/[0.05] dark:ring-white/[0.08] transition-all ios-btn hover:shadow-lg"
            onClick={() => openLightbox(authorWechatImg, "作者微信 — Seven")}
          >
            <img
              src={authorWechatImg}
              alt="作者微信 QR"
              className="w-full h-auto block"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
              <ZoomIn
                className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                strokeWidth={2.5}
              />
            </div>
          </button>
          <div className="mt-3 text-[12px] font-mono font-bold text-gray-700 dark:text-gray-300">
            Seven77078
          </div>
        </div>

        {/* 赞赏支持 */}
        <div className="rounded-[22px] border border-amber-500/20 bg-amber-50/60 dark:bg-amber-950/30 p-5 flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center mb-3">
            <Heart className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <h3 className="text-[15px] font-bold text-amber-900 dark:text-amber-200 mb-1">
            赞赏支持
          </h3>
          <p className="text-[11.5px] text-amber-700/80 dark:text-amber-300/80 mb-3">
            请作者喝杯咖啡 ☕
          </p>
          <button
            type="button"
            className="no-drag-region group relative w-full max-w-[200px] rounded-ios-block overflow-hidden bg-white dark:bg-white/[0.06] shadow-md ring-1 ring-black/[0.05] dark:ring-white/[0.08] transition-all ios-btn hover:shadow-lg"
            onClick={() => openLightbox(sponsorQrImg, "赞赏码 — 给 Seven 赞赏")}
          >
            <img
              src={sponsorQrImg}
              alt="赞赏码"
              className="w-full h-auto block"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
              <ZoomIn
                className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                strokeWidth={2.5}
              />
            </div>
          </button>
          <div className="mt-3 text-[11px] text-amber-700/70 dark:text-amber-300/70">
            完全自愿，不影响任何功能
          </div>
        </div>

        {/* 微信交流群 */}
        <div className="rounded-[22px] border border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-950/30 p-5 flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mb-3">
            <Users className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <h3 className="text-[15px] font-bold text-emerald-900 dark:text-emerald-200 mb-1">
            微信交流群
          </h3>
          <p className="text-[11.5px] text-emerald-700/80 dark:text-emerald-300/80 mb-3">
            一群满了点切换下一群 ({groupIndex + 1}/{GROUP_IMAGES.length})
          </p>
          <button
            type="button"
            className="no-drag-region group relative w-full max-w-[200px] rounded-ios-block overflow-hidden bg-white dark:bg-white/[0.06] shadow-md ring-1 ring-black/[0.05] dark:ring-white/[0.08] transition-all ios-btn hover:shadow-lg"
            onClick={() => openLightbox(currentGroupImg, `微信群 ${groupIndex + 1}`)}
          >
            <img
              src={currentGroupImg}
              alt="微信群 QR"
              className="w-full h-auto block"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
              <ZoomIn
                className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                strokeWidth={2.5}
              />
            </div>
          </button>
          <button
            type="button"
            className="no-drag-region mt-3 text-[12px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
            onClick={cycleGroup}
          >
            切换下一群 →
          </button>
        </div>
      </section>

      <LegalDisclaimer />

      <section className="mt-8 text-center text-[12px] text-gray-500 dark:text-gray-500 leading-relaxed">
        Made with ❤️ by Seven
        <br />
        Built with{" "}
        <a
          href="https://wails.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ios-blue hover:underline"
        >
          Wails v2
        </a>{" "}
        ·{" "}
        <a
          href="https://react.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ios-blue hover:underline"
        >
          React 18
        </a>{" "}
        ·{" "}
        <a
          href="https://tailwindcss.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ios-blue hover:underline"
        >
          TailwindCSS
        </a>
      </section>

      {lightboxImg && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-md p-6 cursor-pointer"
              onClick={() => setLightboxImg(null)}
            >
              <div className="relative flex flex-col items-center max-w-md w-full">
                <button
                  type="button"
                  className="absolute -top-12 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxImg(null);
                  }}
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
                <img
                  src={lightboxImg}
                  alt={lightboxLabel}
                  className="w-full h-auto rounded-[20px] shadow-2xl"
                />
                <p className="mt-4 text-[14px] font-bold text-white/90 text-center">
                  {lightboxLabel}
                </p>
                <p className="mt-1 text-[11px] text-white/50 text-center">
                  点击任意处关闭 · 用微信扫描二维码
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
