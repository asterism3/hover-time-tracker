import { Plugin, ItemView, WorkspaceLeaf, MarkdownView } from 'obsidian';
import * as echarts from 'echarts';


interface TimeLog {
  [date: string]: {
    [note: string]: number;
  };
}


export const HOVER_TIME_VIEW_TYPE = 'hover-time-view';


//main plugin class
export default class HoverTimeTrackerPlugin extends Plugin {
  public timeLogs: TimeLog = {};
  private currentNote: string | null = null;
  private sessionStartTime = 0;
  private statusEl!: HTMLElement;

  async onload() {
    // Load persisted logs
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

    // Ribbon button to open stats view
    this.addRibbonIcon('clock', 'Show hover stats', () => this.openHoverTimeView());

    // Expose for DataviewJS
    (window as any).hoverTimeData = this.timeLogs;
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
    const date = new Date().toISOString().split('T')[0];
    if (!this.timeLogs[date]) this.timeLogs[date] = {};
    this.timeLogs[date][note] = (this.timeLogs[date][note] || 0) + ms;
    (window as any).hoverTimeData = this.timeLogs;
  }


  // status bar: todya's total time in ms
  private updateStatusBar() {
    const date = new Date().toISOString().split('T')[0];
    const todayLog = this.timeLogs[date] || {};
    const totalMs = Object.values(todayLog).reduce((a, b) => a + b, 0);
    const mins = Math.round(totalMs / 60000);
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

    
    // create a container
    const chartContainer = this.containerEl.createEl('div');
    chartContainer.addClass('hover-time-chart');

   

    // Determine theme text color via CSS variable
    const themeStyles = getComputedStyle(document.body);
    const textColor = themeStyles.getPropertyValue('--text-normal').trim() || '#000';

    // init echarts
    const chart = echarts.init(chartContainer);

    // prepare data
    const date = new Date().toISOString().split('T')[0];
    const data = this.plugin.timeLogs[date] || {};
    const labels = Object.keys(data);
    const values = labels.map((note) => Math.round(data[note] / 60000));

    // Chart options with dynamic text color and bottom legend
    const option = {
      tooltip: {
        trigger: 'item',
        textStyle: { color: textColor },
        
      },
      legend: {
        orient: 'horizontal',
        left: 'center',
        top: '75%',
        textStyle: { color: textColor }, 
        itemGap: 20,
        itemWidth: 12,
        itemHeight: 12
      },
      series: [{
        name: 'Time Spent',
        type: 'pie',
        center: ['50%', '38%'],
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: {
          show: false,
          position: 'center',
          color: textColor,
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

    // Resize handler: maintain square aspect ratio
    const resizeChart = () => {
      const w = chartContainer.clientWidth;
      chartContainer.style.height = `${w}px`;
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
