import { App } from 'obsidian';
import ReTaskPlugin from 'src/main';
import { RepeatingTask, TaskInstance, getEndDate } from "../models/RepeatingTask";
import { Notificator } from './Notificator';
import { Storage } from './Storage';
import { TaskParser } from './TaskParser';
import { TaskScheduler } from './TaskScheduler';
import { Mutex } from 'async-mutex';


/**
 * Управляет повторяющимися задачами: загрузка, генерация инстансов, их активация и хранение.
 */
export class TaskManager {

    parser: TaskParser;

    private plugin: ReTaskPlugin;
    private storage: Storage;

    private scheduler: TaskScheduler;
    private updateTaskFrequencyMinutes: number = 15; // Частота обновления задач в минутах
    private updateInstanceStatusMinute: number = 1;// Частота обновления статуса нистансов задач в минутах

    private mutex: Mutex;

    /**
     * Конструктор TaskManager.
     * @param app - Экземпляр приложения Obsidian для доступа к vault и metadata.
     * @param plugin - Экземпляр плагина для сохранения данных.
     */
    constructor(app: App, plugin: ReTaskPlugin) {
        this.plugin = plugin;
        this.storage = new Storage(app, plugin);
        this.parser = new TaskParser();
        this.scheduler = new TaskScheduler();
        this.mutex = new Mutex();
    }

    /**
     * Загружает задачи из папки RepeatingTasks и хранилища.
     * Вызывается из main.ts при загрузке плагина.
     */
    async loadTasks(): Promise<void> {
        await this.storage.init();
    }

    /**
     * Обновляет все инстансы задач, включая те, которые должны были быть созданы,
     * пока Obsidian был выключен
     * Под обновлением понимается создание новых инстансов по расписанию и 
     */
    async publicUpdateAllTaskInstances(): Promise<void> {
        await this.mutex.runExclusive(async () => {
            Notificator.warn("run publicUpdateAllTaskInstances")
            const currentTime = new Date();
            let hasChange = await this.updateAllTaskInstances(currentTime);
            // Обновляем статусы существующих инстансов
            let hasChange2 = false;
            hasChange2 = await this.updateInstanceStatuses();

            // Обновляем время последнего запуска
            await this.storage.setLastRunTime(currentTime);
            if (hasChange || hasChange2) {
                // Сохраняем изменения, если были добавлены новые инстансы
                await this.storage.saveInstancesToStorage();                
                //Обновляем view
                this.plugin.updateView();
            }
            Notificator.warn("end publicUpdateAllTaskInstances")
        });
    }

    /**
     * Обновляет статусы инстансов задач на основе текущего времени.
     * Использует деревья futureInstances и activeInstances для эффективного доступа.
     * - Перемещает будущие инстансы в активные, когда наступает их время
     * - Автоматически обновляет статусы просроченных инстансов
     */
    async publicUpdateInstanceStatuses(): Promise<void> {
        await this.mutex.runExclusive(async () => {
            Notificator.warn("run publicUpdateInstanceStatuses")
            let hasChange = await this.updateInstanceStatuses();
            if (hasChange) {
                // Сохраняем изменения, если были добавлены новые инстансы
                await this.storage.saveInstancesToStorage();
                //Обновляем view
                this.plugin.updateView();
            }
            Notificator.warn("end publicUpdateInstanceStatuses")
        })
    }

    private async updateAllTaskInstances(currentTime: Date): Promise<boolean> {
        let hasChanges = false;

        Notificator.debug(`Обновление инстансов задач. Последний запуск: ${this.storage.getLastRunTime().toISOString()}`);

        for (const task of this.storage.tasks) {
            if (!task.enabled) continue;

            // Генерируем инстансы с момента последнего запуска
            const newInstances = this.scheduler.generateTaskInstances(
                task,
                this.storage.getLastRunTime(),
                currentTime,
                this.updateTaskFrequencyMinutes
            );

            if (newInstances.length > 0) {
                Notificator.debug(`Создано ${newInstances.length} новых инстансов для задачи ${task.name}`);

                // Добавляем новые инстансы в соответствующие коллекции
                for (const instance of newInstances) {
                    // Проверяем, не существует ли уже инстанс с таким ID
                    if (!this.storage.allInstances.has(instance.id)) {
                        this.storage.allInstances.set(instance.id, instance);
                        task.instances.push(instance);

                        // Распределяем по коллекциям в зависимости от статуса
                        if (instance.getStatus() === 'not_started') {
                            this.storage.futureInstances.insert(instance);
                        } else if (instance.getStatus() === 'pending') {
                            this.storage.activeInstances.insert(instance);
                        } else {
                            Notificator.error(`wrong instans status`, instance);
                        }

                        hasChanges = true;
                    } else {
                        Notificator.warn("duplicate instance.id", instance)
                    }
                }
            }
        }
        return hasChanges;
    }

    private async updateInstanceStatuses(): Promise<boolean> {
        Notificator.warn(`Start updateInstanceStatuses`)
        Notificator.debug(`Обновление статусов инстансов задач.`);
        let hasChanges = false;
        // Обработка будущих инстансов, которые должны стать активными
        while (this.storage.futureInstances.count() > 0) {
            let instance = this.storage.futureInstances.min().getValue();
            // Notificator.debug(`min instance: ${instance}`, instance);

            // Проверяем, наступило ли время начала инстанса
            if (instance.isStarted()) {
                if (instance.isOverdue()) {
                    // Если инстанс уже просрочен, отмечаем его как пропущенный
                    await this.markTask(instance, 'skipped', false);
                } else {
                    // Если инстанс начался, но не просрочен, отмечаем его как ожидающий
                    await this.markTask(instance, "pending", false);
                }
                hasChanges = true;
            } else {
                // Если время инстанса еще не наступило, прерываем цикл
                break;
            }
        }

        if (Notificator.debugMode) {
            const instancesToProcess: TaskInstance[] = [];
            this.storage.futureInstances.traverseInOrder((node) => {
                const instance = node.getValue();
                if (instance.isStarted()) {
                    instancesToProcess.push(instance);
                }
            });

            if (instancesToProcess.length !== 0) {
                Notificator.error("bad instances in futureInstances", instancesToProcess);
            }
        }



        // Обработка активных инстансов
        while (this.storage.activeInstances.count() > 0) {
            let instance = this.storage.activeInstances.min().getValue();
            if (instance.getStatus() !== 'pending') {
                this.storage.activeInstances.remove(instance);
                Notificator.warn('Not pending taskInstance in active queue', instance);
                hasChanges = true;
            }
            if (instance.isOverdue()) {
                await this.markTask(instance, 'skipped', false);
                hasChanges = true;
            } else {
                break;
            }
        }
        if (hasChanges) {
            Notificator.debug(`Обновлены статусы инстансов задач.`);
        }
        Notificator.warn(`End updateInstanceStatuses`)
        return hasChanges;
    }

    /**
     * Отмечает инстанс задачи заданным статусом и обновляет хранилище.
     * @param taskInstance - Инстанс, который нужно отметить.
     * @param status - Новый статус ("not_started", "pending", "done", "canceled", "skipped").
     */
    async markTask(taskInstance: TaskInstance, status: "not_started" | "pending" | "done" | "canceled" | "skipped", saveToStorage: Boolean = true): Promise<void> {
        // Notificator.debug(`markTask `, taskInstance);
        await this.storage.markTask(taskInstance, status);
        if (saveToStorage) {
            await this.storage.saveInstancesToStorage();
        }
    }


    /**
     * Очищает хранилище плагина при выгрузке.
     */
    async clearStorage(): Promise<void> {
        await this.storage.clearStorage();
    }


    /**
     * Возвращает частоту обновления задач в минутах
     */
    getUpdateTaskFrequencyMinutes(): number {
        return this.updateTaskFrequencyMinutes;
    }

    /**
     * Возвращает частоту обновления статуса инстансов задач в минутах
     */
    getUpdateInstanceStatusMinute() {
        return this.updateInstanceStatusMinute;
    }

    /**
     * Возвращает все инстансы задач для отображения.
     * @returns Массив TaskInstance со всеми задачами.
     * @todo Добавить фильтр по статусу или другим параметрам позже.
     */
    getTaskInstances(): TaskInstance[] {
        return Array.from(this.storage.allInstances.values());
    }

    /**
    * Выгружает менеджер, очищая ресурсы.
    */
    async onunload(): Promise<void> {
        // Сохраняем инстансы перед выгрузкой
        await this.storage.saveInstancesToStorage();
    }

}