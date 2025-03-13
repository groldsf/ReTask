import { App, Plugin, TFile } from 'obsidian';
import { RepeatingTask, TaskInstance, getEndDate } from "../models/RepeatingTask";
import { TaskParser } from './TaskParser';
import { Notificator } from './Notificator';
import { BinarySearchTree } from '@datastructures-js/binary-search-tree';
import cronParser from 'cron-parser';
import { TaskScheduler } from './TaskScheduler';

interface StoredTaskInstance {
    id: string;
    taskId: string;
    activePeriod: {
        start: string;
        end: string;
    };
    status: "not_started" | "pending" | "done" | "canceled" | "skipped";
}

/**
 * Управляет повторяющимися задачами: загрузка, генерация инстансов, их активация и хранение.
 */
export class TaskManager {
    tasks: RepeatingTask[] = [];
    futureInstances: BinarySearchTree<TaskInstance>;
    activeInstances: BinarySearchTree<TaskInstance>;
    allInstances: Map<string, TaskInstance> = new Map(); // Хранит все инстансы по ID
    parser: TaskParser;

    private app: App;
    private plugin: Plugin;

    private scheduler: TaskScheduler;
    private lastRunTime: Date;
    private updateFrequencyMinutes: number = 15; // Частота обновления в минутах

    /**
     * Конструктор TaskManager.
     * @param app - Экземпляр приложения Obsidian для доступа к vault и metadata.
     * @param plugin - Экземпляр плагина для сохранения данных.
     */
    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
        this.parser = new TaskParser();
        this.scheduler = new TaskScheduler();
        this.lastRunTime = new Date(0); // Начальное значение - "эпоха"
        this.futureInstances = new BinarySearchTree<TaskInstance>(
            (a, b) => a.activePeriod.start.getTime() - b.activePeriod.start.getTime()
        );
        this.activeInstances = new BinarySearchTree<TaskInstance>(
            (a, b) => a.activePeriod.end.getTime() - b.activePeriod.end.getTime()
        );
    }

    /**
     * Загружает задачи из папки RepeatingTasks и хранилища.
     * Вызывается из main.ts при загрузке плагина.
     */
    async loadTasks(): Promise<void> {
        const folder = this.app.vault.getFolderByPath('RepeatingTasks');
        if (!folder) {
            Notificator.error('Folder "RepeatingTasks" not found');
            return;
        }

        for (const file of folder.children) {
            if (file instanceof TFile && file.extension === 'md') {
                const cache = this.app.metadataCache.getFileCache(file);
                if (!cache) continue;

                const task = this.parser.parseTask(file, cache);
                if (task) {
                    this.tasks.push(task);
                }
            }
        }
        await this.loadInstancesFromStorageToTask();
        await this.loadLastRunTime();
        await this.updateAllTaskInstances();
    }

    /**
     * Обновляет все инстансы задач, включая те, которые должны были быть созданы,
     * пока Obsidian был выключен
     */
    async updateAllTaskInstances(): Promise<void> {
        const currentTime = new Date();
        let hasChanges = false;

        Notificator.debug(`Обновление инстансов задач. Последний запуск: ${this.lastRunTime.toISOString()}`);

        for (const task of this.tasks) {
            if (!task.enabled) continue;

            // Генерируем инстансы с момента последнего запуска
            const newInstances = this.scheduler.generateTaskInstances(
                task,
                this.lastRunTime,
                currentTime,
                this.updateFrequencyMinutes
            );

            if (newInstances.length > 0) {
                Notificator.debug(`Создано ${newInstances.length} новых инстансов для задачи ${task.name}`);

                // Добавляем новые инстансы в соответствующие коллекции
                for (const instance of newInstances) {
                    // Проверяем, не существует ли уже инстанс с таким ID
                    if (!this.allInstances.has(instance.id)) {
                        this.allInstances.set(instance.id, instance);
                        task.instances.push(instance);

                        // Распределяем по коллекциям в зависимости от статуса
                        if (instance.status === 'not_started' && instance.activePeriod.start > currentTime) {
                            this.futureInstances.insert(instance);
                        } else if (instance.status === 'pending') {
                            this.activeInstances.insert(instance);
                        }

                        hasChanges = true;
                    }
                }
            }
        }
        // Сохраняем изменения, если были добавлены новые инстансы
        if (hasChanges) {
            await this.saveInstancesToStorage();
        }

        // Обновляем время последнего запуска
        this.lastRunTime = currentTime;

        // Сохраняем время последнего запуска
        await this.saveLastRunTime();
    }

    /**
     * Сохраняет время последнего запуска в хранилище
     */
    private async saveLastRunTime(): Promise<void> {
        const data = await this.plugin.loadData() || {};
        data.lastRunTime = this.lastRunTime.toISOString();
        await this.plugin.saveData(data);
    }

    /**
     * Загружает время последнего запуска из хранилища
     */
    private async loadLastRunTime(): Promise<void> {
        const data = await this.plugin.loadData();
        if (data && data.lastRunTime) {
            this.lastRunTime = new Date(data.lastRunTime);
        }
    }

    /**
     * Создает новый экземпляр задачи на основе начальной даты.
     * @param task - Задача, для которой создается инстанс.
     * @param startDate - Дата начала инстанса.
     * @returns Новый TaskInstance с уникальным ID и вычисленным периодом активности.
     */
    createTaskInstanceFromTask(task: RepeatingTask, startDate: Date): TaskInstance {
        return new TaskInstance(
            this.getNewTaskInstanceId(task, startDate),
            task,
            {
                start: startDate,
                end: getEndDate(startDate, task.duration)
            }
        );
    }

    /**
     * Генерирует уникальный ID для инстанса задачи.
     * @param task - Задача, для которой создается инстанс.
     * @param start - Дата начала инстанса.
     * @returns Строковый ID в формате "taskId-timestamp".
     */
    private getNewTaskInstanceId(task: RepeatingTask, start: Date): string {
        return `${task.id}-${start.getTime()}`;
    }

    /**
     * Возвращает все инстансы задач для отображения.
     * @returns Массив TaskInstance со всеми задачами.
     * @todo Добавить фильтр по статусу или другим параметрам позже.
     */
    getTaskInstances(): TaskInstance[] {
        return Array.from(this.allInstances.values());
    }

    /**
     * Отмечает инстанс задачи заданным статусом и обновляет хранилище.
     * @param taskInstance - Инстанс, который нужно отметить.
     * @param status - Новый статус ("pending", "done", "canceled", "skipped").
     */
    async markTask(taskInstance: TaskInstance, status: "pending" | "done" | "canceled" | "skipped"): Promise<void> {
        const oldStatus = taskInstance.status;
        taskInstance.setStatus(status);

        if (oldStatus === 'pending' && status !== 'pending') {
            this.activeInstances.remove(taskInstance);
        } else if (oldStatus !== 'pending' && status === 'pending') {
            this.futureInstances.remove(taskInstance);
            this.activeInstances.insert(taskInstance);
        }
        await this.saveInstancesToStorage();
        Notificator.info(`Task ${taskInstance.id} marked as ${status}`);
    }

    /**
     * Сохраняет все инстансы задач в хранилище плагина.
     */
    async saveInstancesToStorage(): Promise<void> {
        const instancesToSave: StoredTaskInstance[] = [];
        this.tasks.forEach(task => {
            task.instances.forEach(instance => {
                instancesToSave.push(instance.toJSON());
            });
        });
        await this.plugin.saveData({ repeatingTaskInstances: instancesToSave });
    }

    /**
     * Загружает сохраненные инстансы из хранилища и распределяет их по структурам.
     * Завершенные инстансы также добавляются в allInstances.
     */
    async loadInstancesFromStorageToTask(): Promise<void> {
        const data = await this.plugin.loadData();
        if (!data || !data.repeatingTaskInstances) return;

        const instances = data.repeatingTaskInstances as StoredTaskInstance[];
        instances.forEach((storedInstance: StoredTaskInstance) => {
            const task = this.tasks.find(t => t.id === storedInstance.taskId);
            if (!task) return;

            const instance = TaskInstance.fromJSON(storedInstance, task);
            task.instances.push(instance);
            this.allInstances.set(instance.id, instance); // Добавляем в allInstances
            if (instance.status === "pending") {
                this.activeInstances.insert(instance);
            } else if (instance.status === "not_started") {
                this.futureInstances.insert(instance);
            }
        });
    }

    /**
     * Очищает хранилище плагина при выгрузке.
     */
    async clearStorage(): Promise<void> {
        await this.plugin.saveData({});
    }

    /**
     * Возвращает частоту обновления в минутах
     */
    getUpdateFrequencyMinutes(): number {
        return this.updateFrequencyMinutes;
    }

     /**
     * Выгружает менеджер, очищая ресурсы.
     */
     async onunload(): Promise<void> {
        // Сохраняем инстансы перед выгрузкой
        await this.saveInstancesToStorage();
    }

    /**
     * Вычисляет статус просрочки инстанса на основе текущего времени и порогов.
     * @param taskInstance - Инстанс для проверки.
     * @returns Статус просрочки ("green", "yellow", "red", "black").
     */
    computeOverdueStatus(taskInstance: TaskInstance): "green" | "yellow" | "red" | "black" {
        const now = new Date().getTime();
        const end = taskInstance.activePeriod.end.getTime();
        const diff = now - end;

        const thresholds = taskInstance.task.overdueThresholds;

        if (diff <= 0) return "green";
        if (diff <= thresholds.green * 60 * 1000) return "green";
        if (diff <= thresholds.yellow * 60 * 1000) return "yellow";
        if (diff <= thresholds.red * 60 * 1000) return "red";
        return "black";
    }

}