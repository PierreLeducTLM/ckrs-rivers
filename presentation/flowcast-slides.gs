/**
 * FlowCast — Générateur de présentation Google Slides (10 minutes)
 *
 * UTILISATION :
 *   1. Va sur https://script.google.com → Nouveau projet
 *   2. Colle ce fichier au complet dans l'éditeur
 *   3. Clique sur ▶ Exécuter, choisis la fonction `createFlowCastDeck`
 *   4. Autorise l'accès à Google Slides / Google Drive
 *   5. Ouvre le lien retourné dans les logs (Affichage → Journaux)
 *
 * Le deck est créé à la racine de ton Google Drive, nom :
 *   « FlowCast — Présentation utilisateurs (SLSJ) »
 *
 * Après génération, remplace les placeholders « [Capture: …] » par des
 * captures d'écran de l'app FlowCast (clic droit → Remplacer l'image).
 */

const DECK_TITLE = 'FlowCast — Présentation utilisateurs (SLSJ)';

// Charte FlowCast
const COLOR = {
  bg:        '#0B1220', // bleu nuit (fond)
  surface:   '#FFFFFF',
  ink:       '#0F172A', // texte principal
  inkSoft:   '#475569',
  accent:    '#0EA5E9', // bleu rivière
  ideal:     '#22C55E', // pastille verte (idéal)
  marginal:  '#EAB308', // pastille jaune (praticable)
  toolow:    '#6B7280', // pastille grise (trop bas)
  highlight: '#FDE68A',
};

// Contenu des 12 diapos
const SLIDES = [
  {
    type: 'title',
    title: 'FlowCast',
    subtitle: "L'app météo des pagayeurs du Saguenay–Lac-Saint-Jean",
    footer: 'Présentation utilisateurs · 10 minutes',
    notes:
      "Bienvenue. En 10 minutes, je vais vous montrer comment FlowCast " +
      "vous donne, en un seul clic, toute l'info dont vous avez besoin " +
      "pour décider quand et où pagayer dans la région.",
  },

  {
    type: 'hook',
    eyebrow: '0:00 — 0:45 · Accroche',
    title: 'Vendredi soir.\nLa Shipshaw était belle mercredi.\nEt demain ?',
    punchline: 'Avant FlowCast : 10 onglets ouverts.\nAvec FlowCast : un seul clic.',
    notes:
      "Anecdote. Vous connaissez la situation : il est vendredi soir, " +
      "vous avez vu de l'eau sur la Shipshaw mercredi, mais demain ? " +
      "Vous ouvrez le site du gouvernement, MétéoMédia, Facebook... " +
      "10 onglets plus tard, vous n'êtes toujours pas certain. " +
      "C'est exactement ce qu'on règle.",
  },

  {
    type: 'problem',
    eyebrow: '0:45 — 1:30 · Le problème',
    title: 'Planifier une descente, c\'est compliqué',
    bullets: [
      {
        emoji: '📊',
        title: 'Données brutes',
        text: 'Un débit en m³/s ne dit pas si c\'est navigable.',
      },
      {
        emoji: '🌧️',
        title: 'Conditions changeantes',
        text: 'Fonte, orages, lâchers de barrage : ça bouge vite au Saguenay.',
      },
      {
        emoji: '🧩',
        title: 'Info éparpillée',
        text: 'Débit ici, météo là, neige ailleurs, niveaux de barrage encore ailleurs.',
      },
    ],
    quote:
      "« Pour planifier une descente sur la Mistassini, " +
      "il fallait être à moitié hydrologue. Plus maintenant. »",
    notes:
      "Trois douleurs concrètes : données brutes, conditions qui changent " +
      "vite, et info dispersée. C'est le quotidien du pagayeur régional.",
  },

  {
    type: 'pitch',
    eyebrow: '1:30 — 2:15 · FlowCast en une phrase',
    title: "L'app météo des pagayeurs du SLSJ",
    pitch:
      "Toutes les rivières de la région, en temps réel,\n" +
      "prévisions sur 7 jours, alertes intelligentes —\n" +
      "en un seul clic.",
    pillTitle: 'Spécialement pour NOS rivières',
    pills: [
      'Shipshaw',
      'Mistassini',
      'Mistassibi',
      'Ashuapmushuan',
      'Métabetchouane',
      'Petite-Décharge',
      'Belle-Rivière',
      '+ autres',
    ],
    notes:
      "Insister : ce n'est pas une app générique nord-américaine. " +
      "C'est une app pensée pour le Saguenay–Lac-Saint-Jean. " +
      "Nommer les rivières que les gens connaissent.",
  },

  {
    type: 'section',
    eyebrow: '2:15 — 7:00',
    title: 'DÉMO',
    subtitle: '« Tout en un clic »',
    notes:
      "Transition vers la démo. Annoncer : on passe au téléphone, " +
      "je vais répéter « regardez, un seul clic » à chaque écran. " +
      "C'est le cœur de la présentation — 4 min 45 s.",
  },

  {
    type: 'demo',
    eyebrow: 'Démo a) · 60 s',
    title: 'Onglet Explorer',
    subtitle: 'Trouve une rivière en un clic',
    statuses: [
      { label: 'Idéal',      color: COLOR.ideal },
      { label: 'Praticable', color: COLOR.marginal },
      { label: 'Trop bas',   color: COLOR.toolow },
    ],
    bullets: [
      'Toutes les rivières du SLSJ avec leur pastille de statut',
      'La pastille verte saute aux yeux — pas besoin de chercher',
      'Filtre instantané par classe de rapides (I à V)',
    ],
    placeholder: '[Capture : onglet Explorer avec liste de rivières]',
    notes:
      "Ouvrir l'app sur scène. Pointer la pastille verte. " +
      "Faire le filtre Classe III en direct.",
  },

  {
    type: 'demo',
    eyebrow: 'Démo b) · 90 s',
    title: 'Page rivière (Shipshaw)',
    subtitle: 'Tout sur une rivière, sur un seul écran',
    bullets: [
      'Débit actuel + flèche de tendance (↑ ↓ →)',
      'Prévision 48 h : courbe réelle vs prédite',
      '« Devrait être bonne dans 6 heures » en bandeau',
      'Météo 7 jours : précipitations + fonte de neige',
      'Put-in / take-out → un clic → Google Maps',
    ],
    placeholder: '[Capture : page détaillée Shipshaw avec graphique 48h]',
    notes:
      "C'EST L'ARME SECRÈTE. Passer du temps ici. " +
      "Montrer le graphique, le bandeau « bonne dans X heures », " +
      "puis le clic vers Google Maps. " +
      "Phrase clé : « tout ce dossier de planification, un seul écran ».",
  },

  {
    type: 'demoSplit',
    eyebrow: 'Démo c) + d) · 75 s',
    title: 'Mes Rivières + Carte',
    leftTitle: 'Mes Rivières',
    leftSubtitle: 'Tes favorites, triées par condition',
    leftBullets: [
      'Étoile une rivière sur la page détail',
      'Tri « conditions idéales en premier »',
      'Bascule carte / liste',
    ],
    rightTitle: 'Carte du SLSJ',
    rightSubtitle: 'La région d\'un seul regard',
    rightBullets: [
      'Marqueurs colorés par statut',
      'Filtre Classe IV+ pour les sections expertes',
      '« Bleu sur la carte = bleu sur l\'eau »',
    ],
    notes:
      "Mes Rivières en premier, puis basculer sur l'onglet Carte. " +
      "Insister : tu vois TOUTE la région d'un coup d'œil.",
  },

  {
    type: 'demo',
    eyebrow: 'Démo e) · 60 s',
    title: 'Notifications',
    subtitle: 'On t\'avertit, tu cliques, tu pars',
    bullets: [
      'Abonne-toi à une rivière (ex. Mistassibi)',
      'Seuils : « devient praticable » / « redescend trop bas »',
      'Push (app native) ou courriel (web)',
      'Digest forecast : mer / jeu / ven · 18 h',
    ],
    quote: '« Tu ne consultes même plus l\'app — c\'est elle qui te texte. »',
    placeholder: '[Capture : notification push + écran d\'abonnement]',
    notes:
      "Activer un abonnement en direct sur la Mistassibi. " +
      "Montrer un exemple de notification réelle si possible.",
  },

  {
    type: 'features',
    eyebrow: '7:00 — 8:00 · En coulisses',
    title: 'Ce qui rend FlowCast intelligent',
    items: [
      {
        title: 'Prévisions corrigées',
        text: 'L\'app apprend de ses erreurs d\'hier pour mieux prévoir demain.',
      },
      {
        title: 'Mises à jour aux 30 min',
        text: 'Pendant les heures de pagaie : 5 h à 22 h, tous les jours.',
      },
      {
        title: 'Bilingue · mode sombre · time travel',
        text: 'FR/EN, dark mode, voyage dans le temps (passé/futur).',
      },
      {
        title: 'Assistant IA (bêta)',
        text: '« Qu\'est-ce qui est bon en fin de semaine près de Saint-Félicien ? »',
      },
    ],
    notes:
      "Trois atouts techniques traduits en bénéfices utilisateur. " +
      "Le tease IA est un teaser — ne pas s'éterniser.",
  },

  {
    type: 'install',
    eyebrow: '8:00 — 8:45 · Installation',
    title: 'Installe-la maintenant',
    subtitle: '30 secondes, mets tes rivières en étoile, active les notifs',
    options: [
      { label: 'iOS',     hint: 'App Store' },
      { label: 'Android', hint: 'Play Store' },
      { label: 'Web',     hint: 'Tout navigateur' },
    ],
    qrPlaceholder: '[QR code · à insérer après génération]',
    notes:
      "Laisser le QR code visible pendant le Q&A. " +
      "Les gens installent pendant que tu parles.",
  },

  {
    type: 'closing',
    eyebrow: '8:45 — 10:00 · Q&A',
    title: 'Toute l\'info,\nen un clic.',
    subtitle: 'Spécialement pour le Saguenay–Lac-Saint-Jean.',
    cta:
      'Quelles rivières on devrait ajouter ?\n' +
      'Quelles sections vous manquent ?\n' +
      'On construit FlowCast AVEC vous.',
    contact: 'flowcast.ca · @flowcast · Communauté Facebook',
    notes:
      "Clore sur l'appel à la communauté. Inviter les questions. " +
      "Garder le QR code de la diapo précédente accessible.",
  },
];

// === Génération ===

function createFlowCastDeck() {
  const presentation = SlidesApp.create(DECK_TITLE);
  const url = presentation.getUrl();

  // Supprimer la diapo par défaut, on construit tout
  const defaultSlides = presentation.getSlides();
  defaultSlides.forEach(s => s.remove());

  SLIDES.forEach((data, index) => {
    const slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    paintBackground_(slide);
    drawSlide_(slide, data, index + 1, SLIDES.length);
    setNotes_(slide, data.notes);
  });

  Logger.log('✅ Présentation créée : ' + url);
  return url;
}

// === Rendu par type de diapo ===

function drawSlide_(slide, data, n, total) {
  switch (data.type) {
    case 'title':     renderTitle_(slide, data); break;
    case 'hook':      renderHook_(slide, data); break;
    case 'problem':   renderProblem_(slide, data); break;
    case 'pitch':     renderPitch_(slide, data); break;
    case 'section':   renderSection_(slide, data); break;
    case 'demo':      renderDemo_(slide, data); break;
    case 'demoSplit': renderDemoSplit_(slide, data); break;
    case 'features':  renderFeatures_(slide, data); break;
    case 'install':   renderInstall_(slide, data); break;
    case 'closing':   renderClosing_(slide, data); break;
  }
  drawFooter_(slide, n, total);
}

function renderTitle_(slide, d) {
  // Fond bleu nuit déjà appliqué
  setSlideBg_(slide, COLOR.bg);

  addText_(slide, 'FlowCast', 60, 200, 840, 100, {
    size: 72, bold: true, color: COLOR.surface, align: 'center',
  });
  addText_(slide, d.subtitle, 60, 310, 840, 80, {
    size: 24, color: '#CBD5E1', align: 'center',
  });
  addText_(slide, d.footer, 60, 470, 840, 30, {
    size: 14, color: '#64748B', align: 'center',
  });

  // Pastilles décoratives
  drawPill_(slide, 380, 410, 50, 18, COLOR.ideal);
  drawPill_(slide, 440, 410, 50, 18, COLOR.marginal);
  drawPill_(slide, 500, 410, 50, 18, COLOR.toolow);
}

function renderHook_(slide, d) {
  drawEyebrow_(slide, d.eyebrow);
  addText_(slide, d.title, 60, 130, 840, 220, {
    size: 44, bold: true, color: COLOR.ink, align: 'left',
  });
  drawDivider_(slide, 60, 380, 840);
  addText_(slide, d.punchline, 60, 410, 840, 90, {
    size: 26, italic: true, color: COLOR.accent, align: 'left',
  });
}

function renderProblem_(slide, d) {
  drawEyebrow_(slide, d.eyebrow);
  addText_(slide, d.title, 60, 110, 840, 60, {
    size: 36, bold: true, color: COLOR.ink,
  });
  // 3 colonnes
  const colW = 260, colH = 220, top = 200, gap = 30, leftStart = 60;
  d.bullets.forEach((b, i) => {
    const x = leftStart + i * (colW + gap);
    drawCard_(slide, x, top, colW, colH);
    addText_(slide, b.emoji, x + 20, top + 16, 60, 50, { size: 36 });
    addText_(slide, b.title, x + 20, top + 70, colW - 40, 30, {
      size: 18, bold: true, color: COLOR.ink,
    });
    addText_(slide, b.text, x + 20, top + 105, colW - 40, 100, {
      size: 14, color: COLOR.inkSoft,
    });
  });
  addText_(slide, d.quote, 60, 450, 840, 60, {
    size: 16, italic: true, color: COLOR.inkSoft, align: 'center',
  });
}

function renderPitch_(slide, d) {
  drawEyebrow_(slide, d.eyebrow);
  addText_(slide, d.title, 60, 110, 840, 60, {
    size: 36, bold: true, color: COLOR.ink,
  });
  addText_(slide, d.pitch, 60, 200, 840, 130, {
    size: 26, color: COLOR.ink, align: 'center',
  });
  addText_(slide, d.pillTitle, 60, 360, 840, 30, {
    size: 14, bold: true, color: COLOR.inkSoft, align: 'center',
  });
  // Pills de rivières
  let x = 80, y = 410;
  d.pills.forEach(name => {
    const w = Math.max(80, name.length * 11);
    if (x + w > 880) { x = 80; y += 40; }
    drawTextPill_(slide, x, y, w, 28, name, COLOR.accent);
    x += w + 10;
  });
}

function renderSection_(slide, d) {
  setSlideBg_(slide, COLOR.bg);
  drawEyebrow_(slide, d.eyebrow, '#94A3B8');
  addText_(slide, d.title, 60, 200, 840, 100, {
    size: 80, bold: true, color: COLOR.surface, align: 'center',
  });
  addText_(slide, d.subtitle, 60, 320, 840, 60, {
    size: 28, italic: true, color: COLOR.accent, align: 'center',
  });
}

function renderDemo_(slide, d) {
  drawEyebrow_(slide, d.eyebrow);
  addText_(slide, d.title, 60, 110, 540, 50, {
    size: 32, bold: true, color: COLOR.ink,
  });
  addText_(slide, d.subtitle, 60, 165, 540, 30, {
    size: 18, italic: true, color: COLOR.accent,
  });

  // Statuts (uniquement pour la diapo Explorer)
  if (d.statuses) {
    let x = 60;
    d.statuses.forEach(s => {
      drawPill_(slide, x, 220, 18, 18, s.color);
      addText_(slide, s.label, x + 28, 215, 120, 28, { size: 14, color: COLOR.ink });
      x += 140;
    });
  }

  const bulletsTop = d.statuses ? 270 : 220;
  drawBulletList_(slide, d.bullets, 60, bulletsTop, 540);

  // Placeholder visuel
  if (d.placeholder) {
    drawPlaceholder_(slide, 640, 110, 260, 380, d.placeholder);
  }

  if (d.quote) {
    addText_(slide, d.quote, 60, 470, 540, 40, {
      size: 14, italic: true, color: COLOR.inkSoft,
    });
  }
}

function renderDemoSplit_(slide, d) {
  drawEyebrow_(slide, d.eyebrow);
  addText_(slide, d.title, 60, 110, 840, 50, {
    size: 32, bold: true, color: COLOR.ink,
  });

  // Colonne gauche
  drawCard_(slide, 60, 190, 400, 320);
  addText_(slide, d.leftTitle, 80, 210, 360, 30, {
    size: 20, bold: true, color: COLOR.ink,
  });
  addText_(slide, d.leftSubtitle, 80, 245, 360, 25, {
    size: 13, italic: true, color: COLOR.accent,
  });
  drawBulletList_(slide, d.leftBullets, 80, 285, 360, 13);

  // Colonne droite
  drawCard_(slide, 500, 190, 400, 320);
  addText_(slide, d.rightTitle, 520, 210, 360, 30, {
    size: 20, bold: true, color: COLOR.ink,
  });
  addText_(slide, d.rightSubtitle, 520, 245, 360, 25, {
    size: 13, italic: true, color: COLOR.accent,
  });
  drawBulletList_(slide, d.rightBullets, 520, 285, 360, 13);
}

function renderFeatures_(slide, d) {
  drawEyebrow_(slide, d.eyebrow);
  addText_(slide, d.title, 60, 110, 840, 60, {
    size: 36, bold: true, color: COLOR.ink,
  });
  // Grille 2x2
  const cellW = 400, cellH = 145, gap = 40;
  d.items.forEach((item, i) => {
    const x = 60 + (i % 2) * (cellW + gap);
    const y = 200 + Math.floor(i / 2) * (cellH + 20);
    drawCard_(slide, x, y, cellW, cellH);
    addText_(slide, item.title, x + 20, y + 18, cellW - 40, 30, {
      size: 18, bold: true, color: COLOR.ink,
    });
    addText_(slide, item.text, x + 20, y + 55, cellW - 40, 80, {
      size: 14, color: COLOR.inkSoft,
    });
  });
}

function renderInstall_(slide, d) {
  drawEyebrow_(slide, d.eyebrow);
  addText_(slide, d.title, 60, 110, 840, 50, {
    size: 36, bold: true, color: COLOR.ink, align: 'center',
  });
  addText_(slide, d.subtitle, 60, 170, 840, 30, {
    size: 16, italic: true, color: COLOR.accent, align: 'center',
  });
  // QR placeholder
  drawPlaceholder_(slide, 380, 230, 200, 200, d.qrPlaceholder);
  // 3 options
  const optW = 240, top = 460;
  d.options.forEach((opt, i) => {
    const x = 90 + i * (optW + 20);
    addText_(slide, opt.label, x, top, optW, 30, {
      size: 18, bold: true, color: COLOR.accent, align: 'center',
    });
    addText_(slide, opt.hint, x, top + 28, optW, 20, {
      size: 12, color: COLOR.inkSoft, align: 'center',
    });
  });
}

function renderClosing_(slide, d) {
  setSlideBg_(slide, COLOR.bg);
  drawEyebrow_(slide, d.eyebrow, '#94A3B8');
  addText_(slide, d.title, 60, 130, 840, 160, {
    size: 64, bold: true, color: COLOR.surface, align: 'center',
  });
  addText_(slide, d.subtitle, 60, 290, 840, 40, {
    size: 22, italic: true, color: COLOR.accent, align: 'center',
  });
  drawDivider_(slide, 200, 350, 560, '#334155');
  addText_(slide, d.cta, 60, 370, 840, 100, {
    size: 18, color: '#CBD5E1', align: 'center',
  });
  addText_(slide, d.contact, 60, 480, 840, 30, {
    size: 13, color: '#64748B', align: 'center',
  });
}

// === Helpers de dessin ===

function paintBackground_(slide) {
  setSlideBg_(slide, COLOR.surface);
}

function setSlideBg_(slide, hex) {
  slide.getBackground().setSolidFill(hex);
}

function addText_(slide, text, x, y, w, h, opts) {
  opts = opts || {};
  const box = slide.insertTextBox(text, x, y, w, h);
  const range = box.getText();
  const style = range.getTextStyle();
  if (opts.size)   style.setFontSize(opts.size);
  if (opts.bold)   style.setBold(true);
  if (opts.italic) style.setItalic(true);
  if (opts.color)  style.setForegroundColor(opts.color);
  style.setFontFamily('Helvetica');
  if (opts.align) {
    const para = range.getParagraphStyle();
    const map = {
      left:   SlidesApp.ParagraphAlignment.START,
      center: SlidesApp.ParagraphAlignment.CENTER,
      right:  SlidesApp.ParagraphAlignment.END,
    };
    para.setParagraphAlignment(map[opts.align]);
  }
  return box;
}

function drawCard_(slide, x, y, w, h) {
  const shape = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, x, y, w, h);
  shape.getFill().setSolidFill('#F8FAFC');
  shape.getBorder().setWeight(1);
  shape.getBorder().getLineFill().setSolidFill('#E2E8F0');
  return shape;
}

function drawPill_(slide, x, y, w, h, color) {
  const shape = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, x, y, w, h);
  shape.getFill().setSolidFill(color);
  shape.getBorder().setTransparent();
  return shape;
}

function drawTextPill_(slide, x, y, w, h, text, color) {
  const shape = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, x, y, w, h);
  shape.getFill().setSolidFill('#E0F2FE');
  shape.getBorder().setWeight(1);
  shape.getBorder().getLineFill().setSolidFill(color);
  const text_ = shape.getText();
  text_.setText(text);
  text_.getTextStyle().setFontSize(12).setForegroundColor(color).setBold(true);
  text_.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
}

function drawDivider_(slide, x, y, w, color) {
  const line = slide.insertLine(SlidesApp.LineCategory.STRAIGHT, x, y, x + w, y);
  line.getLineFill().setSolidFill(color || '#E2E8F0');
  line.setWeight(1);
}

function drawEyebrow_(slide, text, color) {
  addText_(slide, text, 60, 50, 840, 30, {
    size: 12, bold: true, color: color || COLOR.accent,
  });
}

function drawBulletList_(slide, items, x, y, w, fontSize) {
  fontSize = fontSize || 16;
  const text = items.map(item => '•  ' + item).join('\n\n');
  addText_(slide, text, x, y, w, items.length * 50, {
    size: fontSize, color: COLOR.ink,
  });
}

function drawPlaceholder_(slide, x, y, w, h, label) {
  const shape = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, x, y, w, h);
  shape.getFill().setSolidFill('#F1F5F9');
  shape.getBorder().setWeight(2);
  shape.getBorder().getLineFill().setSolidFill('#CBD5E1');
  const text_ = shape.getText();
  text_.setText(label);
  text_.getTextStyle().setFontSize(12).setForegroundColor('#64748B').setItalic(true);
  text_.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
}

function drawFooter_(slide, n, total) {
  addText_(slide, 'FlowCast · SLSJ', 60, 525, 200, 20, {
    size: 10, color: '#94A3B8',
  });
  addText_(slide, n + ' / ' + total, 720, 525, 180, 20, {
    size: 10, color: '#94A3B8', align: 'right',
  });
}

function setNotes_(slide, notes) {
  if (!notes) return;
  const notesShape = slide.getNotesPage().getSpeakerNotesShape();
  notesShape.getText().setText(notes);
}
