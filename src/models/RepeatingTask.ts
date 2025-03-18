export interface Duration {
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
}

export interface Schedule {
	type: 'preset' | 'interval' | 'cron';
	value: string | { days: number; hours: number; minutes: number; seconds: number };
}

export interface RepeatingTask {
	id: string;
	name: string;
	description: string;
	startTime: Date;
	duration: Duration;
	schedule: Schedule;
	overdueThresholds: { green: number; yellow: number; red: number };
	instances: TaskInstance[];
	filePath: string;
	enabled: boolean;
}

export interface SerializedTaskInstance {
	id: string;
	taskId: string;
	activePeriod: {
		start: string;
		end: string;
	};
	status: "not_started" | "pending" | "done" | "canceled" | "skipped";
}

export class TaskInstance {
	id: string;
	task: RepeatingTask;
	activePeriod: { start: Date; end: Date };
	private status: "not_started" | "pending" | "done" | "canceled" | "skipped";

	constructor(id: string, task: RepeatingTask, activePeriod: { start: Date; end: Date }) {
		this.id = id;
		this.task = task;
		this.activePeriod = activePeriod;
		this.status = "not_started"; // По умолчанию
	}

	/**
	* Создает новый экземпляр задачи на основе начальной даты.
	* @param task - Задача, для которой создается инстанс.
	* @param startDate - Дата начала инстанса.
	* @returns Новый TaskInstance с уникальным ID и вычисленным периодом активности.
	*/
	static fromTask(task: RepeatingTask, startDate: Date): TaskInstance {
		return new TaskInstance(
			`${task.id}-${startDate.getTime()}`,
			task,
			{
				start: startDate,
				end: getEndDate(startDate, task.duration)
			}
		);
	}

	toJSON(): SerializedTaskInstance {
		return {
			id: this.id,
			taskId: this.task.id, // Сохраняем только ID задачи, а не весь объект
			activePeriod: {
				start: this.activePeriod.start.toISOString(),
				end: this.activePeriod.end.toISOString()
			},
			status: this.status
		};
	}

	static fromJSON(data: SerializedTaskInstance, task: RepeatingTask): TaskInstance {
		return new TaskInstance(
			data.id,
			task,
			{
				start: new Date(data.activePeriod.start),
				end: new Date(data.activePeriod.end)
			}
		).setStatus(data.status);
	}

	isStarted(): boolean {
		return new Date() >= this.activePeriod.start;
	}

	isOverdue(): boolean {
		return new Date() > this.activePeriod.end;
	}

	setStatus(status: "not_started" | "pending" | "done" | "canceled" | "skipped"): this {
		this.status = status;
		return this;
	}

	getStatus(): "not_started" | "pending" | "done" | "canceled" | "skipped" {
		return this.status;
	}

	/**
	 * Вычисляет статус просрочки инстанса на основе текущего времени и порогов.
	 * @returns Статус просрочки ("green", "yellow", "red", "black").
	 */
	getOverdueStatus(): "green" | "yellow" | "red" | "black" {
		const now = new Date().getTime();
		const end = this.activePeriod.end.getTime();
		const diff = now - end;

		const thresholds = this.task.overdueThresholds;

		if (diff <= 0) return "green";
		if (diff <= thresholds.green * 60 * 1000) return "green";
		if (diff <= thresholds.yellow * 60 * 1000) return "yellow";
		if (diff <= thresholds.red * 60 * 1000) return "red";
		return "black";
	}
}

export function getEndDate(startDate: Date, duration: Duration): Date {
	const endDate = new Date(startDate); // Создаем копию даты начала

	// Прибавляем дни
	endDate.setDate(startDate.getDate() + duration.days);

	// Прибавляем часы
	endDate.setHours(startDate.getHours() + duration.hours);

	// Прибавляем минуты
	endDate.setMinutes(startDate.getMinutes() + duration.minutes);

	// Прибавляем секунды
	endDate.setSeconds(startDate.getSeconds() + duration.seconds);

	return endDate;
}