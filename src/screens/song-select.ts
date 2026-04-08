// Song select screen: browse imported beatmaps and import new .osz files

import { Container, Graphics, Text, type Application } from 'pixi.js';
import type { Screen } from './screen-manager.ts';
import {
  getAllBeatmapSets,
  saveBeatmapSet,
  getScores,
  deleteBeatmapSet,
  type StoredBeatmapSet,
} from '../storage/beatmap-db.ts';
import { loadOsz } from '../core/osz-loader.ts';
import { audioEngine } from '../core/audio-engine.ts';
import { setCurrentBeatmap } from './gameplay.ts';

type ScreenNavigator = (name: string) => void;

const HEADER_HEIGHT = 60;
const FOOTER_HEIGHT = 70;
const CARD_HEIGHT = 60;
const CARD_GAP = 8;
const TAP_THRESHOLD = 12; // px movement to distinguish tap from drag

interface CardEntry {
  set: StoredBeatmapSet;
  diffIdx: number;
  y: number; // position in list space
}

interface DeleteZone {
  setId: number;
  y: number;
  height: number;
  xStart: number; // only trigger delete if tap is in the right portion
}

export class SongSelectScreen implements Screen {
  private app!: Application;
  private container!: Container;
  private listContainer!: Container;
  private navigate: ScreenNavigator;
  private beatmapSets: StoredBeatmapSet[] = [];
  private scrollY = 0;
  private fileInput!: HTMLInputElement;
  private loadingText: Text | null = null;
  private totalListHeight = 0;
  private cards: CardEntry[] = [];
  private deleteZones: DeleteZone[] = [];

  constructor(navigate: ScreenNavigator) {
    this.navigate = navigate;
  }

  enter(app: Application): void {
    this.app = app;
    this.container = new Container();
    this.container.sortableChildren = true;
    app.stage.addChild(this.container);

    const w = app.screen.width;
    const h = app.screen.height;

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, w, h);
    bg.fill({ color: 0x1a1a2e });
    bg.zIndex = 0;
    this.container.addChild(bg);

    // === SCROLLABLE LIST AREA (middle) ===
    const listAreaHeight = h - HEADER_HEIGHT - FOOTER_HEIGHT;

    this.listContainer = new Container();
    this.listContainer.position.set(0, 0);
    this.listContainer.zIndex = 1;

    // Mask to clip list to the visible area between header and footer
    const listMask = new Graphics();
    listMask.rect(0, HEADER_HEIGHT, w, listAreaHeight);
    listMask.fill({ color: 0xffffff });
    this.container.addChild(listMask);
    this.listContainer.mask = listMask;

    this.container.addChild(this.listContainer);

    // === TOUCH OVERLAY — catches all pointer events in the list area ===
    // This sits ABOVE the list cards so it always receives events.
    // It handles scrolling (drag) and tap detection (hit-test against card positions).
    const touchOverlay = new Graphics();
    touchOverlay.rect(0, HEADER_HEIGHT, w, listAreaHeight);
    touchOverlay.fill({ color: 0xffffff, alpha: 0.001 }); // nearly invisible but hittable
    touchOverlay.zIndex = 5;
    touchOverlay.eventMode = 'static';
    this.container.addChild(touchOverlay);

    let isDragging = false;
    let dragStartY = 0;
    let dragStartScroll = 0;
    let wasDrag = false;

    touchOverlay.on('pointerdown', (e) => {
      isDragging = true;
      wasDrag = false;
      dragStartY = e.globalY;
      dragStartScroll = this.scrollY;
    });

    touchOverlay.on('pointermove', (e) => {
      if (!isDragging) return;
      const dy = e.globalY - dragStartY;
      if (Math.abs(dy) > TAP_THRESHOLD) wasDrag = true;
      this.scrollY = dragStartScroll + dy;
      this.clampScroll();
      this.listContainer.position.y = HEADER_HEIGHT + this.scrollY;
    });

    const endDrag = (e: { globalX: number; globalY: number }) => {
      if (!isDragging) return;
      isDragging = false;

      // If it was a tap (not a drag), find which card was tapped
      if (!wasDrag) {
        this.handleTap(e.globalX, e.globalY);
      }
    };
    touchOverlay.on('pointerup', endDrag);
    touchOverlay.on('pointerupoutside', () => {
      isDragging = false;
    });

    // Mouse wheel scrolling
    touchOverlay.on('wheel', (e: WheelEvent) => {
      this.scrollY -= e.deltaY;
      this.clampScroll();
      this.listContainer.position.y = HEADER_HEIGHT + this.scrollY;
    });

    // === HEADER (on top of everything) ===
    const header = new Container();
    header.zIndex = 10;

    const headerBg = new Graphics();
    headerBg.rect(0, 0, w, HEADER_HEIGHT);
    headerBg.fill({ color: 0x1a1a2e });
    headerBg.eventMode = 'static'; // block events from passing through header
    header.addChild(headerBg);

    const title = new Text({
      text: 'superosu',
      style: {
        fontSize: 32,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xff66aa,
      },
    });
    title.anchor.set(0.5, 0.5);
    title.position.set(w / 2, HEADER_HEIGHT / 2);
    header.addChild(title);

    const settingsBtn = new Text({
      text: '⚙',
      style: { fontSize: 26, fill: 0xcccccc },
    });
    settingsBtn.anchor.set(0.5);
    settingsBtn.position.set(w - 30, HEADER_HEIGHT / 2);
    settingsBtn.eventMode = 'static';
    settingsBtn.cursor = 'pointer';
    settingsBtn.on('pointerdown', () => this.navigate('settings'));
    header.addChild(settingsBtn);

    this.container.addChild(header);

    // === FOOTER (on top of everything) ===
    const footer = new Container();
    footer.zIndex = 10;

    const footerBg = new Graphics();
    footerBg.rect(0, h - FOOTER_HEIGHT, w, FOOTER_HEIGHT);
    footerBg.fill({ color: 0x1a1a2e });
    footerBg.eventMode = 'static'; // block events from passing through footer
    footer.addChild(footerBg);

    const footerLine = new Graphics();
    footerLine.rect(0, h - FOOTER_HEIGHT, w, 1);
    footerLine.fill({ color: 0x333355 });
    footer.addChild(footerLine);

    const importBtn = new Graphics();
    const btnW = 160;
    const btnH = 44;
    importBtn.roundRect(w / 2 - btnW / 2, h - FOOTER_HEIGHT + 13, btnW, btnH, 8);
    importBtn.fill({ color: 0xff66aa });
    importBtn.eventMode = 'static';
    importBtn.cursor = 'pointer';
    importBtn.on('pointerdown', () => this.importOsz());
    footer.addChild(importBtn);

    const importText = new Text({
      text: 'Import .osz',
      style: {
        fontSize: 18,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    importText.anchor.set(0.5);
    importText.position.set(w / 2, h - FOOTER_HEIGHT + 13 + btnH / 2);
    footer.addChild(importText);

    this.container.addChild(footer);

    // Create hidden file input
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.osz';
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => this.onFileSelected());

    this.listContainer.position.y = HEADER_HEIGHT;
    this.loadBeatmaps();
    this.autoLoadTestBeatmap();
  }

  private handleTap(screenX: number, screenY: number): void {
    // Convert screen Y to list-space Y
    const listY = screenY - HEADER_HEIGHT - this.scrollY;

    // Check delete zones first (only if tap is on the right side)
    for (const zone of this.deleteZones) {
      if (
        listY >= zone.y &&
        listY < zone.y + zone.height &&
        screenX >= zone.xStart
      ) {
        this.confirmDelete(zone.setId);
        return;
      }
    }

    // Check card taps
    for (const card of this.cards) {
      if (listY >= card.y && listY < card.y + CARD_HEIGHT) {
        this.playBeatmap(card.set, card.diffIdx);
        return;
      }
    }
  }

  private confirmDelete(setId: number): void {
    // Show confirmation overlay
    const overlay = new Container();
    overlay.zIndex = 50;

    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const dimBg = new Graphics();
    dimBg.rect(0, 0, w, h);
    dimBg.fill({ color: 0x000000, alpha: 0.7 });
    dimBg.eventMode = 'static'; // block events below
    overlay.addChild(dimBg);

    const msg = new Text({
      text: 'Delete this beatmap set?',
      style: {
        fontSize: 20,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    msg.anchor.set(0.5);
    msg.position.set(w / 2, h / 2 - 40);
    overlay.addChild(msg);

    const makeBtn = (label: string, x: number, color: number, cb: () => void) => {
      const btn = new Graphics();
      btn.roundRect(x - 55, h / 2, 110, 40, 8);
      btn.fill({ color });
      btn.eventMode = 'static';
      btn.cursor = 'pointer';
      btn.on('pointerdown', cb);
      overlay.addChild(btn);

      const txt = new Text({
        text: label,
        style: { fontSize: 16, fontFamily: 'Arial', fontWeight: 'bold', fill: 0xffffff },
      });
      txt.anchor.set(0.5);
      txt.position.set(x, h / 2 + 20);
      overlay.addChild(txt);
    };

    makeBtn('Delete', w / 2 - 70, 0xcc3333, async () => {
      this.container.removeChild(overlay);
      overlay.destroy({ children: true });
      await deleteBeatmapSet(setId);
      await this.loadBeatmaps();
    });

    makeBtn('Cancel', w / 2 + 70, 0x555577, () => {
      this.container.removeChild(overlay);
      overlay.destroy({ children: true });
    });

    this.container.addChild(overlay);
  }

  private async autoLoadTestBeatmap(): Promise<void> {
    const existing = await getAllBeatmapSets();
    if (existing.length > 0) return;

    const testFiles = [
      '/sabrina-espresso.osz',
      '/laufey-from-the-start.osz',
      '/sia-chandelier.osz',
    ];

    for (const url of testFiles) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const buffer = await resp.arrayBuffer();
        const osz = loadOsz(buffer);
        if (osz.beatmaps.length === 0) continue;

        const firstMap = osz.beatmaps[0];
        await saveBeatmapSet({
          title: firstMap.metadata.title,
          artist: firstMap.metadata.artist,
          creator: firstMap.metadata.creator,
          difficulties: osz.beatmaps,
          audioData: osz.audioData,
          backgroundBlob: osz.backgroundBlob,
        });
      } catch {
        // File not available, skip
      }
    }

    await this.loadBeatmaps();
  }

  private clampScroll(): void {
    const viewHeight = this.app.screen.height - HEADER_HEIGHT - FOOTER_HEIGHT;
    const minScroll = Math.min(0, -(this.totalListHeight - viewHeight));
    this.scrollY = Math.max(minScroll, Math.min(0, this.scrollY));
  }

  private async loadBeatmaps(): Promise<void> {
    this.beatmapSets = await getAllBeatmapSets();
    await this.renderList();
  }

  private async renderList(): Promise<void> {
    this.listContainer.removeChildren();
    this.cards = [];
    this.deleteZones = [];

    if (this.beatmapSets.length === 0) {
      const viewHeight = this.app.screen.height - HEADER_HEIGHT - FOOTER_HEIGHT;
      const empty = new Text({
        text: 'No beatmaps imported yet.\nTap "Import .osz" to get started!',
        style: {
          fontSize: 18,
          fontFamily: 'Arial',
          fill: 0x888888,
          align: 'center',
        },
      });
      empty.anchor.set(0.5);
      empty.position.set(this.app.screen.width / 2, viewHeight / 2);
      this.listContainer.addChild(empty);
      this.totalListHeight = 0;
      return;
    }

    const w = this.app.screen.width;
    let y = 8; // top padding

    for (const set of this.beatmapSets) {
      // Set header with song name and delete button
      const headerHeight = 32;
      const header = new Container();
      header.position.set(0, y);

      const firstDiff = set.difficulties[0];
      const headerText = new Text({
        text: `${firstDiff.metadata.artist} - ${firstDiff.metadata.title}`,
        style: {
          fontSize: 13,
          fontFamily: 'Arial',
          fontWeight: 'bold',
          fill: 0x999999,
        },
      });
      headerText.position.set(14, 8);
      if (headerText.width > w - 80) {
        headerText.width = w - 80;
      }
      header.addChild(headerText);

      // Delete "×" button
      const deleteBtn = new Text({
        text: '×',
        style: {
          fontSize: 22,
          fontFamily: 'Arial',
          fontWeight: 'bold',
          fill: 0x664444,
        },
      });
      deleteBtn.anchor.set(1, 0);
      deleteBtn.position.set(w - 14, 4);
      header.addChild(deleteBtn);

      this.listContainer.addChild(header);

      // Track delete zone (right 50px of the header)
      if (set.id != null) {
        this.deleteZones.push({
          setId: set.id,
          y,
          height: headerHeight,
          xStart: w - 50,
        });
      }

      y += headerHeight;

      for (let dIdx = 0; dIdx < set.difficulties.length; dIdx++) {
        const diff = set.difficulties[dIdx];
        let bestScore: { score: number; rank: string; accuracy: number } | null = null;
        if (set.id != null) {
          const scores = await getScores(set.id, diff.metadata.version);
          if (scores.length > 0) {
            bestScore = {
              score: scores[0].score,
              rank: scores[0].rank,
              accuracy: scores[0].accuracy,
            };
          }
        }

        const card = this.createBeatmapCard(set, dIdx, y, bestScore);
        this.listContainer.addChild(card);
        this.cards.push({ set, diffIdx: dIdx, y });
        y += CARD_HEIGHT + CARD_GAP;
      }
      y += 8; // gap between sets
    }
    this.totalListHeight = y;
  }

  private createBeatmapCard(
    set: StoredBeatmapSet,
    diffIdx: number,
    y: number,
    bestScore: { score: number; rank: string; accuracy: number } | null
  ): Container {
    const diff = set.difficulties[diffIdx];
    const card = new Container();
    card.position.set(10, y);

    const cardWidth = this.app.screen.width - 20;

    // Card background — NOT interactive (touch overlay handles all events)
    const cardBg = new Graphics();
    cardBg.roundRect(0, 0, cardWidth, CARD_HEIGHT, 8);
    cardBg.fill({ color: 0x2a2a4e });
    card.addChild(cardBg);

    const versionText = new Text({
      text: diff.metadata.version,
      style: {
        fontSize: 18,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xff66aa,
      },
    });
    versionText.position.set(12, 10);
    card.addChild(versionText);

    const statsText = new Text({
      text: `CS:${diff.difficulty.cs}  AR:${diff.difficulty.ar}  OD:${diff.difficulty.od}  HP:${diff.difficulty.hp}  |  ${diff.hitObjects.length} obj`,
      style: {
        fontSize: 12,
        fontFamily: 'Arial',
        fill: 0x888888,
      },
    });
    statsText.position.set(12, 38);
    card.addChild(statsText);

    // Best score display on the right side of the card
    if (bestScore) {
      const RANK_COLORS: Record<string, number> = {
        SS: 0xffdd00, S: 0xffdd00, A: 0x66ff66,
        B: 0x66aaff, C: 0xaa66ff, D: 0xff4444,
      };

      const rankText = new Text({
        text: bestScore.rank,
        style: {
          fontSize: 28,
          fontFamily: 'Arial',
          fontWeight: 'bold',
          fill: RANK_COLORS[bestScore.rank] ?? 0xffffff,
        },
      });
      rankText.anchor.set(1, 0.5);
      rankText.position.set(cardWidth - 12, CARD_HEIGHT / 2 - 8);
      card.addChild(rankText);

      const scoreText = new Text({
        text: `${(bestScore.accuracy * 100).toFixed(1)}%`,
        style: {
          fontSize: 12,
          fontFamily: 'Arial',
          fill: 0xaaaaaa,
        },
      });
      scoreText.anchor.set(1, 0);
      scoreText.position.set(cardWidth - 12, CARD_HEIGHT / 2 + 10);
      card.addChild(scoreText);
    }

    return card;
  }

  private async playBeatmap(
    set: StoredBeatmapSet,
    diffIdx: number
  ): Promise<void> {
    await audioEngine.init();
    setCurrentBeatmap(set, diffIdx);
    this.navigate('gameplay');
  }

  private importOsz(): void {
    this.fileInput.click();
  }

  private async onFileSelected(): Promise<void> {
    const file = this.fileInput.files?.[0];
    if (!file) return;

    this.loadingText = new Text({
      text: 'Loading...',
      style: {
        fontSize: 24,
        fontFamily: 'Arial',
        fill: 0xff66aa,
      },
    });
    this.loadingText.anchor.set(0.5);
    this.loadingText.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2
    );
    this.loadingText.zIndex = 100;
    this.container.addChild(this.loadingText);

    try {
      const buffer = await file.arrayBuffer();
      const osz = loadOsz(buffer);

      if (osz.beatmaps.length === 0) {
        throw new Error('No beatmaps found in .osz file');
      }

      const firstMap = osz.beatmaps[0];
      await saveBeatmapSet({
        title: firstMap.metadata.title,
        artist: firstMap.metadata.artist,
        creator: firstMap.metadata.creator,
        difficulties: osz.beatmaps,
        audioData: osz.audioData,
        backgroundBlob: osz.backgroundBlob,
      });

      await this.loadBeatmaps();
    } catch (err) {
      console.error('Failed to import .osz:', err);
      const errorText = new Text({
        text: `Import failed: ${err}`,
        style: { fontSize: 16, fontFamily: 'Arial', fill: 0xff4444 },
      });
      errorText.anchor.set(0.5);
      errorText.position.set(
        this.app.screen.width / 2,
        this.app.screen.height / 2 + 40
      );
      errorText.zIndex = 100;
      this.container.addChild(errorText);
      setTimeout(() => {
        this.container.removeChild(errorText);
        errorText.destroy();
      }, 3000);
    } finally {
      if (this.loadingText) {
        this.container.removeChild(this.loadingText);
        this.loadingText.destroy();
        this.loadingText = null;
      }
      this.fileInput.value = '';
    }
  }

  exit(app: Application): void {
    document.body.removeChild(this.fileInput);
    app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}
