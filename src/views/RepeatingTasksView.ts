import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import RepeatingTasksPlugin from '../main';
import { RepeatingTask, TaskHistoryEntry, TaskInstance } from '../models/RepeatingTask'
import { TaskManager } from 'src/services/TaskManager';


export const VIEW_TYPE_REPEATING_TASKS = "repeating-tasks-view";


export class RepeatingTasksView extends ItemView {
  taskManager: TaskManager;
  container: HTMLElement;

  constructor(leaf: WorkspaceLeaf, taskManager: TaskManager) {
    super(leaf);
    this.taskManager = taskManager;
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
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.gap = '15px';
    this.container.createEl('h2', { text: 'Активные повторяющиеся задачи' });

    const taskInstances = await this.taskManager.getActiveTaskInstances();
    if (taskInstances.length === 0) {
        this.container.createEl('p', { text: 'Задачи не найдены' });
    }

    taskInstances.forEach(task => {
        this.renderTask(task);
    });
}

  private renderTask(taskInstance: TaskInstance) {
    const instanceEl = this.container.createDiv({ cls: 'task-instance card' });
    instanceEl.style.userSelect = 'text';
    const task = taskInstance.task;

    const headerEl = instanceEl.createDiv({ cls: 'task-header' });
    headerEl.createEl('h3', { text: task.name });
    headerEl.createEl('p', { text: task.description, cls: 'task-description' });

    const datesEl = instanceEl.createDiv({ cls: 'task-dates' });
    const dateFormatter = new Intl.DateTimeFormat(navigator.language, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const startDate = dateFormatter.format(taskInstance.activePeriod.start).replace(/,/, '');
    const endDate = dateFormatter.format(taskInstance.activePeriod.end).replace(/,/, '');
    datesEl.createEl('span', { text: `Начало: ${startDate}`, cls: 'task-date' });
    datesEl.createEl('span', { text: `Конец: ${endDate}`, cls: 'task-date' });

    const overdueStatus = this.taskManager.computeOverdueStatus(taskInstance);
    const statusEl = instanceEl.createDiv({ cls: 'task-status' });
    statusEl.createEl('span', { text: 'Статус: ' + overdueStatus.toUpperCase(), cls: `status-${overdueStatus}` });

    const buttonContainer = instanceEl.createDiv({ cls: 'task-actions' });
    const doneBtn = buttonContainer.createEl('button', { text: 'Сделана', cls: 'task-button' });
    doneBtn.onclick = async () => {
      await this.taskManager.markTask(taskInstance, 'done');
      this.render();
    };
    const canceledBtn = buttonContainer.createEl('button', { text: 'Отменена', cls: 'task-button' });
    canceledBtn.onclick = async () => {
      await this.taskManager.markTask(taskInstance, 'canceled');
      this.render();
    };
    const skippedBtn = buttonContainer.createEl('button', { text: 'Пропущена', cls: 'task-button' });
    skippedBtn.onclick = async () => {
      await this.taskManager.markTask(taskInstance, 'skipped');
      this.render();
    };
  }
}
