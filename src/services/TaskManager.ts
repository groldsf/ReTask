import { App, Plugin, TFile } from 'obsidian';
import { RepeatingTask, TaskInstance, getEndDate } from "../models/RepeatingTask";
import { TaskParser } from './TaskParser';
import { Notificator } from './Notificator';
import { BinarySearchTree } from '@datastructures-js/binary-search-tree';
import cronParser from 'cron-parser';

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

    /**
     * Конструктор TaskManager.
     * @param app - Экземпляр приложения Obsidian для доступа к vault и metadata.
     * @param plugin - Экземпляр плагина для сохранения данных.
     */
    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
        this.parser = new TaskParser();
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
        await this.generateNextInstancesForTasks();
    }

    generateNextInstancesForTasks() {
        Notificator.debug("start generateNextInstancesForTasks")
        this.tasks.forEach(task => {
            const newInstances = this.generateNextInstancesForTask(task);
            newInstances.forEach(instance => {
                this.allInstances.set(instance.id, instance);
                task.instances.push(instance);
                if (instance.status === 'not_started' && instance.activePeriod.start > new Date()) {
                    this.futureInstances.insert(instance);
                } else if (instance.status === 'pending') {
                    this.activeInstances.insert(instance);
                }
            });
        });
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

    /**
     * Выгружает менеджер, очищая ресурсы.
     */
    async onunload(): Promise<void> {
        this.app.workspace.detachLeavesOfType('repeating-tasks-view');
        await this.clearStorage();
    }

    /**
     * Генерирует следующие инстансы для задачи на неделю вперед от текущей даты,
     * начиная с последнего существующего инстанса.
     * @param task - Задача, для которой создаются инстансы.
     * @returns Массив созданных TaskInstance.
     */
    private generateNextInstancesForTask(task: RepeatingTask): TaskInstance[] {
        Notificator.debug(`Generating instances for task: ${task.name}, schedule: ${JSON.stringify(task.schedule)}`);
        const instances: TaskInstance[] = [];
        const today = new Date();
        const weekAhead = new Date(today.getTime() + 24 * 60 * 60 * 1000); // +24 часа

        // Определяем точку старта: последний инстанс или startTime
        const existingInstances = task.instances.sort((a, b) => 
            a.activePeriod.start.getTime() - b.activePeriod.start.getTime()
        );
        const lastInstanceStart = existingInstances.length > 0 
            ? existingInstances[existingInstances.length - 1].activePeriod.start 
            : task.startTime;
        let current = new Date(lastInstanceStart);

        if (task.schedule.type === 'preset') {
            while (current <= weekAhead) {
                const instanceId = this.getNewTaskInstanceId(task, current);
                if (!this.allInstances.has(instanceId)) {
                    const instance = this.createTaskInstanceFromTask(task, new Date(current));
                    instances.push(instance);
                }
                switch (task.schedule.value) {
                    case 'daily':
                        current.setUTCDate(current.getUTCDate() + 1);
                        break;
                    case 'weekly':
                        current.setUTCDate(current.getUTCDate() + 7);
                        break;
                    case 'monthly':
                        current.setUTCMonth(current.getUTCMonth() + 1);
                        break;
                }
            }
        } else if (task.schedule.type === 'interval') {
            const interval = task.schedule.value as { days: number; hours: number; minutes: number; seconds: number };
            const intervalMs = (interval.days * 86400000) +
                (interval.hours * 3600000) +
                (interval.minutes * 60000) +
                (interval.seconds * 1000);
            if (intervalMs === 0) throw new Error(`Invalid interval for task ${task.id}: zero duration`);
            while (current <= weekAhead) {
                const instanceId = this.getNewTaskInstanceId(task, current);
                if (!this.allInstances.has(instanceId)) {
                    const instance = this.createTaskInstanceFromTask(task, new Date(current));
                    instances.push(instance);
                }
                current = new Date(current.getTime() + intervalMs);
            }
        } else if (task.schedule.type === 'cron') {
            Notificator.debug(`Start generate by cron`);
            const cronInterval = cronParser.parse(task.schedule.value as string, {
                currentDate: current,
                tz: 'UTC'
            });
            let nextDate = cronInterval.next();
            while (nextDate.toDate() <= weekAhead) {
                const instanceId = this.getNewTaskInstanceId(task, nextDate.toDate());
                if (!this.allInstances.has(instanceId)) {
                    const instance = this.createTaskInstanceFromTask(task, new Date(nextDate.toDate()));
                    instances.push(instance);
                }
                nextDate = cronInterval.next();
            }
        } else {
            throw new Error(`Unknown schedule type for task ${task.name}: ${JSON.stringify(task.schedule)}`);
        }

        return instances;
    }
}