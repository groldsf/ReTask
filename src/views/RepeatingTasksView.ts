import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { TaskInstance } from '../models/RepeatingTask';
import { TaskManager } from 'src/services/TaskManager';

export const VIEW_TYPE_REPEATING_TASKS = "repeating-tasks-view";

/**
 * Представление для отображения всех инстансов повторяющихся задач с фильтром по статусу.
 */
export class RepeatingTasksView extends ItemView {
    taskManager: TaskManager;
    container: HTMLElement;
    filterStatus: string = 'all'; // По умолчанию показываем все задачи

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
        this.container = this.contentEl.createDiv({ cls: 'task-container' });
        this.render();
    }

    async render() {
        this.container.empty();
        this.container.createEl('h2', { text: 'Повторяющиеся задачи' });

        // Добавляем фильтр по статусу
        const filterContainer = this.container.createDiv({ cls: 'task-filter' });
        filterContainer.createEl('label', { text: 'Фильтр по статусу: ', attr: { for: 'status-filter' } });
        const select = filterContainer.createEl('select', { attr: { id: 'status-filter' } });
        select.createEl('option', { text: 'Все', attr: { value: 'all' } });
        select.createEl('option', { text: 'Не начато', attr: { value: 'not_started' } });
        select.createEl('option', { text: 'В процессе', attr: { value: 'pending' } });
        select.createEl('option', { text: 'Выполнено', attr: { value: 'done' } });
        select.createEl('option', { text: 'Отменено', attr: { value: 'canceled' } });
        select.createEl('option', { text: 'Пропущено', attr: { value: 'skipped' } });
        select.value = this.filterStatus; // Устанавливаем текущий фильтр
        select.onchange = () => {
            this.filterStatus = select.value;
            this.render(); // Перерендерим при смене фильтра
        };

        // Получаем и фильтруем инстансы
        const taskInstances = await this.taskManager.getTaskInstances();
        const filteredInstances = this.filterStatus === 'all' 
            ? taskInstances 
            : taskInstances.filter(task => task.status === this.filterStatus);

        if (filteredInstances.length === 0) {
            this.container.createEl('p', { text: 'Задачи не найдены' });
            return;
        }

        filteredInstances.forEach(task => {
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
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
        const startDate = dateFormatter.format(taskInstance.activePeriod.start);
        const endDate = dateFormatter.format(taskInstance.activePeriod.end);
        datesEl.createEl('span', { text: `Начало: ${startDate}`, cls: 'task-date' });
        datesEl.createEl('span', { text: `Конец: ${endDate}`, cls: 'task-date' });

        // Статус задачи
        const taskStatusEl = instanceEl.createDiv({ cls: 'task-status' });
        taskStatusEl.createEl('span', { 
            text: `Состояние: ${taskInstance.status.toUpperCase()}`, 
            cls: `task-state-${taskInstance.status.toLowerCase()}` 
        });

        // Статус просрочки
        const overdueStatus = this.taskManager.computeOverdueStatus(taskInstance);
        const overdueStatusEl = instanceEl.createDiv({ cls: 'task-status' });
        overdueStatusEl.createEl('span', { 
            text: `Просрочка: ${overdueStatus.toUpperCase()}`, 
            cls: `status-${overdueStatus}` 
        });

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