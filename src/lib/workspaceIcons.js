// Реестр иконок для бейджей рабочих зон канбана.
// icon в БД теперь хранит СТРОКОВЫЙ КЛЮЧ (например 'folder', 'rocket'),
// а не эмодзи — компонент резолвится тут же, на фронте.
import {
  Folder, FolderKanban, Briefcase, Rocket, Target, Flag, Star, Zap,
  BookOpen, Code2, Palette, Megaphone, ShoppingCart, Layers, Package,
  Users, Calendar, LineChart, Wrench, Globe, Lightbulb, Trophy,
  Compass, Gem, Sparkles, Heart, Camera, Music, Coffee, Building2
} from 'lucide-vue-next'

// Порядок — он же порядок в гриде выбора иконки в модалке
export const WORKSPACE_ICONS = {
  folder: Folder, 'folder-kanban': FolderKanban, briefcase: Briefcase,
  rocket: Rocket, target: Target, flag: Flag, star: Star, zap: Zap,
  'book-open': BookOpen, code: Code2, palette: Palette, megaphone: Megaphone,
  cart: ShoppingCart, layers: Layers, package: Package, users: Users,
  calendar: Calendar, chart: LineChart, wrench: Wrench, globe: Globe,
  bulb: Lightbulb, trophy: Trophy, compass: Compass, gem: Gem,
  sparkles: Sparkles, heart: Heart, camera: Camera, music: Music,
  coffee: Coffee, building: Building2
}

// Если в БД остался старый эмодзи (или незнакомый ключ) — не падаем,
// просто показываем дефолтную иконку-папку
export function resolveWorkspaceIcon(key) {
  return WORKSPACE_ICONS[key] || Folder
}

// Палитра для фона бейджа — подобрана так, чтобы читалась и в тёмной,
// и в светлой теме (среднее по светлоте, достаточно насыщенные)
export const WORKSPACE_COLORS = [
  '#7c6af7', // фиолетовый (акцент приложения)
  '#61afef', // синий
  '#4caf7d', // зелёный
  '#e8af34', // жёлтый
  '#e0796c', // терракотовый
  '#e06c75', // красный
  '#d06cc7', // розовый
  '#4bc0c8', // бирюзовый
  '#c9a15a', // охра
  '#8a93a6', // серо-синий
]
