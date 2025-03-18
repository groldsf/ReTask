import { BinarySearchTree } from "@datastructures-js/binary-search-tree";
import { App, TFile } from "obsidian";
import ReTaskPlugin from "src/main";
import { RepeatingTask, TaskInstance } from "src/models/RepeatingTask";
import { TaskParser } from "./TaskParser";
import { Notificator } from "./Notificator";

import { Mutex } from 'async-mutex';

interface StoredTaskInstance {
    id: string;
    taskId: string;
    activePeriod: {
        start: string;
        end: string;
    };
    status: "not_started" | "pending" | "done" | "canceled" | "skipped";
}

export class Storage {
    tasks: RepeatingTask[] = [];
    futureInstances: BinarySearchTree<TaskInstance>;
    activeInstances: BinarySearchTree<TaskInstance>;
    allInstances: Map<string, TaskInstance> = new Map(); // Хранит все инстансы по ID

    private lastRunTime: Date;

    private parser: TaskParser;
    private app: App;
    private plugin: ReTaskPlugin;

    private mutex: Mutex;
    /**
     * Конструктор TaskManager.
     * @param app - Экземпляр приложения Obsidian для доступа к vault и metadata.
     * @param plugin - Экземпляр плагина для сохранения данных.
     */
    constructor(app: App, plugin: ReTaskPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.parser = new TaskParser();
        this.futureInstances = new BinarySearchTree<TaskInstance>(
            (a, b) => {
                if (a.id === b.id) {
                    // Notificator.warn(`eq`);
                    return 0;
                }
                let res = a.activePeriod.start.getTime() - b.activePeriod.start.getTime();
                if (res === 0) {
                    // Notificator.warn(`eq == 0`);
                    res = (a.task.name > b.task.name) ? 1 : -1;
                }
                return res;
            }
        );
        this.activeInstances = new BinarySearchTree<TaskInstance>(
            (a, b) => {
                if (a.id === b.id) {
                    // Notificator.warn(`eq`);
                    return 0;
                }
                let res = a.activePeriod.end.getTime() - b.activePeriod.end.getTime();
                if (res === 0) {
                    // Notificator.warn(`eq == 0`)
                    res = a.task.name > b.task.name ? 1 : -1;
                }
                return res;
            }
        );
        this.mutex = new Mutex();
        this.lastRunTime = new Date(0); // Начальное значение - "эпоха"
    }

    /**
     * Загружает задачи из файлов. 
     * Загружает инстансы из obsidian.storage
     * Загружает LastRunTime из obsidian.storage
     */
    async init(): Promise<void> {
        await this.mutex.runExclusive(async () => {
            await this.loadTasksFromFiles();

            const data = await this.plugin.loadData();
            await this.loadInstancesFromStorageToTask(data);
            await this.loadLastRunTime(data);
            // await this.updateAllTaskIntances();
        });
    }

    /**
     * Сохраняет все инстансы задач в хранилище плагина.
     */
    async saveInstancesToStorage(): Promise<void> {
        await this.mutex.runExclusive(async () => {
            Notificator.debug(`Saving ${this.allInstances.size} instances to storage`);
            const instancesToSave: StoredTaskInstance[] = [];
            this.tasks.forEach(task => {
                task.instances.forEach(instance => {
                    instancesToSave.push(instance.toJSON());
                });
            });

            const data = await this.plugin.loadData() || {};
            data.repeatingTaskInstances = instancesToSave;
            await this.plugin.saveData(data);
        });
    }

    /**
     * Отмечает инстанс задачи заданным статусом и обновляет хранилище.
     * НЕ СОХРАНЯЕТ ИЗМЕНЕНИЯ НА ДИСК
     * @param taskInstance - Инстанс, который нужно отметить.
     * @param status - Новый статус ("not_started", "pending", "done", "canceled", "skipped").
     */
    async markTask(taskInstance: TaskInstance, status: "not_started" | "pending" | "done" | "canceled" | "skipped"): Promise<void> {
        await this.mutex.runExclusive(() => {
            const oldStatus = taskInstance.getStatus();
            taskInstance.setStatus(status);

            if (oldStatus === 'not_started' && status !== 'not_started') {
                const res = this.futureInstances.remove(taskInstance);
                if (!res){
                    Notificator.error(`Task not found in futureInstances ${taskInstance.id}`, taskInstance);
                    throw new Error(`Task not found in futureInstances ${taskInstance.id}`);
                }
            }
            if (oldStatus === 'pending' && status !== 'pending') {
                const res = this.activeInstances.remove(taskInstance);
                if (!res){
                    Notificator.error(`Task not found in activeInstances ${taskInstance.id}`, taskInstance);
                    throw new Error(`Task not found in activeInstances ${taskInstance.id}`);
                }
            }
            if (status === 'pending') {
                this.activeInstances.insert(taskInstance);
            }
            if (status === 'not_started') {
                this.futureInstances.insert(taskInstance);
            }
        });
    }

    getLastRunTime(): Date {
        return this.lastRunTime;
    }

    async setLastRunTime(newLastRunTime: Date): Promise<void> {
        await this.mutex.runExclusive(async () => {
            this.lastRunTime = newLastRunTime;
            this.saveLastRunTime();
        });
    }

    /**
     * Очищает хранилище плагина при выгрузке.
     */
    async clearStorage(): Promise<void> {
        await this.mutex.runExclusive(async () => {
            await this.plugin.saveData({});
        });
    }

    /** 
     * Загружает задачи из файлов
     */
    private async loadTasksFromFiles(): Promise<void> {
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
    }

    /**
     * Загружает сохраненные инстансы из хранилища и распределяет их по структурам.
     * Завершенные инстансы также добавляются в allInstances.
     */
    private async loadInstancesFromStorageToTask(data?: any): Promise<void> {
        if (!data) {
            data = await this.plugin.loadData();
        }
        if (!data || !data.repeatingTaskInstances) {
            Notificator.debug(`Load 0 instances from storage!`);
            return;
        }

        const instances = data.repeatingTaskInstances as StoredTaskInstance[];
        instances.forEach((storedInstance: StoredTaskInstance) => {
            const task = this.tasks.find(t => t.id === storedInstance.taskId);
            if (!task) return;

            const instance = TaskInstance.fromJSON(storedInstance, task);
            task.instances.push(instance);
            this.allInstances.set(instance.id, instance); // Добавляем в allInstances
            if (instance.getStatus() === "pending") {
                this.activeInstances.insert(instance);
            } else if (instance.getStatus() === "not_started") {
                this.futureInstances.insert(instance);
            }
        });
        Notificator.debug(`Загруженно ${instances.length} инстансов!`);
    }

    /**
     * Загружает время последнего запуска из хранилища
     */
    private async loadLastRunTime(data?: any): Promise<void> {
        if (!data) {
            data = await this.plugin.loadData();
        }
        if (data && data.lastRunTime) {
            this.lastRunTime = new Date(data.lastRunTime);
        }
    }

    /**
     * Сохраняет время последнего запуска в хранилище
     */
    private async saveLastRunTime(): Promise<void> {
        const data = await this.plugin.loadData() || {};
        data.lastRunTime = this.lastRunTime.toISOString();
        await this.plugin.saveData(data);
    }
}