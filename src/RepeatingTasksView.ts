import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import RepeatingTasksPlugin from './main';
import { RepeatingTask, TaskHistoryEntry, TaskInstance, generateInstances} from './RepeatingTask'


export const VIEW_TYPE_REPEATING_TASKS = "repeating-tasks-view";


export class RepeatingTasksView extends ItemView {
  plugin: RepeatingTasksPlugin;
  container: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: RepeatingTasksPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_REPEATING_TASKS;
  }

  getDisplayText() {
    return "Повторяющиеся задачи";
  }

  async onOpen() {
    this.container = this.contentEl;
    this.render();
  }

  async render() {
    this.container.empty();
    this.container.createEl('h2', { text: 'Активные повторяющиеся задачи' });

    const taskInstances = await this.plugin.getActiveTaskInstances();
    if (taskInstances.length === 0) {
      this.container.createEl('p', { text: 'Задачи не найдены' });
    }

    taskInstances.forEach(task => {
      this.renderTask(task);
    });
  }

  private renderTask(taskInstance: TaskInstance) {

    
    const instanceEl = this.container.createDiv({ cls: 'task-instance' });
    const status = taskInstance.status;
    const task = taskInstance.task;
    
    

    instanceEl.createEl('h3', { text: task.name });
    instanceEl.createEl('p', { text: task.description });

    // Вычисляем состояние просроченности
    const overdueStatus = this.plugin.computeOverdueStatus(taskInstance);
    const statusEl = instanceEl.createEl('span', { text: 'Статус: ' + overdueStatus.toUpperCase() });
    statusEl.addClass(`status-${overdueStatus}`);

    // Кнопки для отметки статуса задачи
    const buttonContainer = instanceEl.createDiv({ cls: 'task-actions' });
    const doneBtn = buttonContainer.createEl('button', { text: 'Сделана' });
    doneBtn.onclick = async () => {
      await this.plugin.markTask(taskInstance, 'done');
      this.render();
    };

    const canceledBtn = buttonContainer.createEl('button', { text: 'Отменена' });
    canceledBtn.onclick = async () => {
      await this.plugin.markTask(taskInstance, 'canceled');
      this.render();
    };

    const skippedBtn = buttonContainer.createEl('button', { text: 'Пропущена' });
    skippedBtn.onclick = async () => {
      await this.plugin.markTask(taskInstance, 'skipped');
      this.render();
    };
    
  }
}
