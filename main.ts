import { App, Plugin, ItemView, WorkspaceLeaf, MarkdownView, TFile, Setting, PluginSettingTab } from 'obsidian';
import * as echarts from 'echarts';
import moment from 'moment';

interface TimeLog {
  [date: string]: {
    [note: string]: number;
  };
}

interface HoverTimePluginSettings {
  sortBy: 'note' | 'directory' | 'tag';
}

const DEFAULT_SETTINGS: HoverTimePluginSettings = {
  sortBy: 'note'
};

export const HOVER_TIME_VIEW_TYPE = 'hover-time-view';



//main plugin class
export default class HoverTimeTrackerPlugin extends Plugin {

  settings: HoverTimePluginSettings;
  public timeLogs: TimeLog = {};
  public todayMin = 0;
  private currentNote: string | null = null;
  private sessionStartTime = 0;
  private statusEl!: HTMLElement;

  async onload() {
    // Load persisted logs
    await this.loadSettings();
    const stored = await this.loadData();
    this.timeLogs = (stored as TimeLog) || {};

    // Register the side panel view
    this.registerView(HOVER_TIME_VIEW_TYPE, (leaf: WorkspaceLeaf) => new HoverTimeView(leaf, this));

    // Track note switches
    this.app.workspace.on('active-leaf-change', this.onLeafChange.bind(this));

    // Track window focus/blur
    this.registerDomEvent(window, 'focus', this.onWindowFocus.bind(this));
    this.registerDomEvent(window, 'blur', this.onWindowBlur.bind(this));

    // Periodic flush every 60s
    this.registerInterval(
      window.setInterval(() => {
        this.onWindowBlur();
        this.onWindowFocus();
      }, 60000)
    );

    // Status bar
    this.statusEl = this.addStatusBarItem();
    this.updateStatusBar();

    // Setting tab
    this.addSettingTab(new HoverTimeSettingsTab(this.app, this));

    // Ribbon button to open stats view
    this.addRibbonIcon('clock', 'Show hover stats', () => this.openHoverTimeView());

    // Expose for DataviewJS
    (window as any).hoverTimeData = this.timeLogs;
  }


  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) || {}
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // before plugin shuts down, make sure data is stored
  async onunload() {
    this.onWindowBlur();
    await this.saveData(this.timeLogs);
  }


  private onLeafChange(leaf: WorkspaceLeaf) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView && view.file)) {
      this.onWindowBlur();
      this.currentNote = null;
      return;
    }
    const filePath = view.file.path;
    if (filePath !== this.currentNote) {
      this.onWindowBlur();
      this.currentNote = filePath;
      this.onWindowFocus();
    }
  }


  private onWindowFocus() {
    if (this.currentNote) this.sessionStartTime = Date.now();
  }


  // When window blurs, calculate how long you worked, record it, reset timer, update UI, and save.
  private onWindowBlur() {
    if (this.currentNote && this.sessionStartTime) {
      const elapsed = Date.now() - this.sessionStartTime;
      this.recordTime(this.currentNote, elapsed);
      this.sessionStartTime = 0;
      this.updateStatusBar();
      this.saveData(this.timeLogs);
    }
  }


  // records time in ms under today's date and note id
  private recordTime(note: string, ms: number) {
    const date = moment().format('YYYY-MM-DD'); // ASCII minus
    if (!this.timeLogs[date]) this.timeLogs[date] = {};
    this.timeLogs[date][note] = (this.timeLogs[date][note] || 0) + ms;
    (window as any).hoverTimeData = this.timeLogs;
  }


  // status bar: today's total time in ms
  private updateStatusBar() {
    const date = moment().format('YYYY-MM-DD'); // ASCII minus
    const todayLog = this.timeLogs[date] || {};
    const totalMs = Object.values(todayLog).reduce((a, b) => a + b, 0);
    const mins = Math.round(totalMs / 60000);

    this.todayMin = mins;
    
    this.statusEl.setText(`⏱️ ${mins} min`);
  }

  // open side panel after ribbon was clicked
  private openHoverTimeView() {
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      leaf.setViewState({ type: HOVER_TIME_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }
}






// Chart time!
class HoverTimeView extends ItemView {
  private plugin: HoverTimeTrackerPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: HoverTimeTrackerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return HOVER_TIME_VIEW_TYPE;
  }

  getDisplayText() {
    return 'Hover Time Stats';
  }

  async onOpen() {
    this.containerEl.empty();


    //✨ Make the entire view scrollable when content overflows
    this.containerEl.addClass('hover-time-scroll');

    this.containerEl.style.position = 'relative';

    // create the toggle button
    const toggleBtn = this.containerEl.createEl('button', { text: 'Hide Legend' });
    toggleBtn.addClass('hover-legend-toggle');
    Object.assign(toggleBtn.style, {
      position: 'absolute',
      top: '10px',
      right: '10px',
      zIndex: '1000',
      padding: '4px 8px',
      cursor: 'pointer',
    });


    // create a container
    const chartContainer = this.containerEl.createEl('div');
    chartContainer.addClass('hover-time-chart');

   

    // Determine theme text color via CSS variable
    const themeStyles = getComputedStyle(document.body);
    const textColor = themeStyles.getPropertyValue('--text-normal').trim() || '#000';

  

    // prepare data
    const date = moment().format('YYYY-MM-DD'); // ASCII minus
    const data = this.plugin.timeLogs[date] || {};
    const rawPaths = Object.keys(data);
		const labels = rawPaths.map(p => {
			const file = this.app.vault.getAbstractFileByPath(p);
			if (file instanceof TFile) return file.basename;
			return p.split('/').pop()?.replace(/\.md$/i, '') ?? p;
		});
		const values = rawPaths.map(p => Math.round(data[p] / 60000));

    //init Charts
		const chart = echarts.init(chartContainer);
    const todayMin = this.plugin.todayMin;

    // Chart options with dynamic text color and bottom legend
    const option = {
      tooltip: {
        trigger: 'item',
        textStyle: { color: textColor },
        
      },
      legend: {
        orient: 'vertical',
        type: 'scroll',
        left: 'center',
        top: '75%',
        textStyle: { color: textColor }, 
        itemGap: 20,
        itemWidth: 12,
        itemHeight: 12,
        show: true
      },
      series: [{
        name: 'Time Spent',
        type: 'pie',
        center: ['50%', 20],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: {
          show: true,
          position: 'center',
          color: textColor,
          formatter: `${todayMin} min`,
          align: 'center',
          verticalAlign: 'middle'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 40,
            fontWeight: 'bold',
            color: textColor,
            align: 'center',
            verticalAlign: 'middle'
          }
        },
        labelLine: { show: false },
        data: labels.map((name, idx) => ({ value: values[idx], name }))
      }]
    };
    
   
    chart.setOption(option);
    

     // wire up the toggle
    let legendVisible = true;
    toggleBtn.onclick = () => {
      legendVisible = !legendVisible;
      chart.setOption({ legend: { show: legendVisible } });
      toggleBtn.textContent = legendVisible ? 'Hide Legend' : 'Show Legend';
    };

    // Resize handler: maintain square aspect ratio
    const resizeChart = () => {
      const w = chartContainer.clientWidth;
      const h = w * 1.5;
      chartContainer.style.height = `${h}px`;
      const innerRad = w*0.2;
      const outerRad = w*0.35;

      const centerY = outerRad + 20;

      const legendTop = outerRad*2 + 40;

      const emphaSize = innerRad / 3 ;

      chart.setOption({
        series: [{
          radius: [innerRad, outerRad],
          center: ['50%', centerY] as any,  // '50%' on X, centerY px on Y
          emphasis: {
            label: {
              fontSize: emphaSize
            }
          }
        }],

        legend: {
          top: legendTop  // number = px
        }
      });

      chart.resize();
    };

    // Initial and responsive resize
    resizeChart();
    this.registerDomEvent(window, 'resize', resizeChart);
    this.registerEvent(this.app.workspace.on('layout-change', resizeChart));
  }

  async onClose() {
    this.containerEl.empty();
  }
}





// Settings Tab
class HoverTimeSettingsTab extends PluginSettingTab {
	plugin: HoverTimeTrackerPlugin;

	constructor(app: App, plugin: HoverTimeTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h1', { text: 'General' });

  // Sort Chart By…
  new Setting(containerEl)
    .setName('Sort Chart By')
    .setDesc('Order pie slices by note‐name, directory, or tag')
    .addDropdown((dropdown) =>
    dropdown
      .addOption('note', 'Notes')
      .addOption('directory', 'Directory')
      .addOption('tag', 'Tags')
      .setValue(this.plugin.settings.sortBy)
      .onChange(async (value) => {
        this.plugin.settings.sortBy = value as any;
        await this.plugin.saveSettings();
      })
  );
    
	}
}
