/* Icons for the Human Resources screens.

   The standalone HR portal pulled Lucide from a CDN and called
   `lucide.createIcons()`, which needs the whole icon set on the page —
   about a megabyte for the eighty-odd icons these screens actually use,
   fetched from a third origin before anything could render.

   Here the icons are imported by name instead, so the bundler keeps only
   the ones below, and `drawIcons` does the replacement itself. The markup
   contract is unchanged: HR code still emits `<i data-lucide="name">` and
   still calls `icons()` after writing HTML. */

import {
  Activity, AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Award,
  BadgeCheck, BarChart, BarChart2, Bell, Book, BookOpen, Briefcase,
  Building, Building2, Calendar, CalendarOff, Camera, Car, Check,
  CheckCircle, CheckSquare, ChevronDown, ChevronRight, ChevronsDown,
  ChevronsUp, ClipboardCheck, ClipboardList, Clock, CreditCard, Download,
  FileText, Flag, Folder, Gift, GitBranch, GitMerge, Globe, GraduationCap,
  GripVertical, Handshake, Heart, Home, Inbox, Info, Layers,
  LayoutDashboard, Library, List, Loader, Loader2, LogOut, Mail, MapPin,
  Maximize2, Megaphone, MessageCircle, MessageSquare, Package, Paperclip,
  Pencil, PieChart, PlayCircle, Plus, Rocket, RotateCcw, Save, Search,
  Settings, ShieldCheck, Star, Target, Thermometer, Trash2, UploadCloud,
  User, User2, UserCheck, UserCog, UserMinus, UserPlus, Users, Wallet, X,
} from "lucide";

/* Keyed by the kebab-case name the HR markup uses. Adding an icon to a
   screen means adding it here too — an unknown name renders nothing
   rather than throwing, so a missing entry shows up as a blank space. */
const ICONS = {
  "activity": Activity,
  "alert-circle": AlertCircle,
  "alert-triangle": AlertTriangle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "award": Award,
  "badge-check": BadgeCheck,
  "bar-chart": BarChart,
  "bar-chart-2": BarChart2,
  "bell": Bell,
  "book": Book,
  "book-open": BookOpen,
  "briefcase": Briefcase,
  "building": Building,
  "building-2": Building2,
  "calendar": Calendar,
  "calendar-off": CalendarOff,
  "camera": Camera,
  "car": Car,
  "check": Check,
  "check-circle": CheckCircle,
  "check-square": CheckSquare,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "chevrons-down": ChevronsDown,
  "chevrons-up": ChevronsUp,
  "clipboard-check": ClipboardCheck,
  "clipboard-list": ClipboardList,
  "clock": Clock,
  "credit-card": CreditCard,
  "download": Download,
  "file-text": FileText,
  "flag": Flag,
  "folder": Folder,
  "gift": Gift,
  "git-branch": GitBranch,
  "git-merge": GitMerge,
  "globe": Globe,
  "graduation-cap": GraduationCap,
  "grip-vertical": GripVertical,
  "handshake": Handshake,
  "heart": Heart,
  "home": Home,
  "inbox": Inbox,
  "info": Info,
  "layers": Layers,
  "layout-dashboard": LayoutDashboard,
  "library": Library,
  "list": List,
  "loader": Loader,
  "loader-2": Loader2,
  "log-out": LogOut,
  "mail": Mail,
  "map-pin": MapPin,
  "maximize-2": Maximize2,
  "megaphone": Megaphone,
  "message-circle": MessageCircle,
  "message-square": MessageSquare,
  "package": Package,
  "paperclip": Paperclip,
  "pencil": Pencil,
  "pie-chart": PieChart,
  "play-circle": PlayCircle,
  "plus": Plus,
  "rocket": Rocket,
  "rotate-ccw": RotateCcw,
  "save": Save,
  "search": Search,
  "settings": Settings,
  "shield-check": ShieldCheck,
  "star": Star,
  "target": Target,
  "thermometer": Thermometer,
  "trash-2": Trash2,
  "upload-cloud": UploadCloud,
  "user": User,
  "user-2": User2,
  "user-check": UserCheck,
  "user-cog": UserCog,
  "user-minus": UserMinus,
  "user-plus": UserPlus,
  "users": Users,
  "wallet": Wallet,
  "x": X,
};

const SVG_NS = "http://www.w3.org/2000/svg";

/* A Lucide icon is a nested [tag, attributes, children] array. Build the
   SVG from it rather than from an HTML string: the markup goes straight
   into pages that already carry user-entered text, and innerHTML on the
   SVG namespace is inconsistent across browsers. */
function buildSvg([tag, attrs, children = []]) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  for (const child of children) el.appendChild(buildSvg(child));
  return el;
}

/* Replace every `<i data-lucide="…">` inside `scope` with its SVG.

   The placeholder's own attributes are carried across so the size and
   colour set at the call site survive, but `data-lucide` deliberately is
   not: that is what stops a second `icons()` call — and there are more
   than forty — from walking over icons it has already drawn. */
export function drawIcons(scope) {
  const root = scope || document;
  root.querySelectorAll("i[data-lucide]").forEach((placeholder) => {
    const node = ICONS[placeholder.dataset.lucide];
    if (!node) return;

    const svg = buildSvg(node);
    for (const { name, value } of Array.from(placeholder.attributes)) {
      if (name === "data-lucide") continue;
      svg.setAttribute(name, value);
    }
    placeholder.replaceWith(svg);
  });
}
