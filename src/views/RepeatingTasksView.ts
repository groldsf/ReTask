import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { TaskInstance } from '../models/RepeatingTask';
import { TaskManager } from 'src/services/TaskManager';
import { Notificator } from 'src/services/Notificator';

export const VIEW_TYPE_REPEATING_TASKS = "repeating-tasks-view";

/**
 * Представление для отображения всех инстансов повторяющихся задач с фильтром по статусу.
 */
export class RepeatingTasksView extends ItemView {
    taskManager: TaskManager;
    container: HTMLElement;
    filterStatus: string = 'all'; // По умолчанию показываем все задачи
    filterName: string = ''; // Фильтр по имени задачи
    currentPage: number = 1; // Текущая страница
    itemsPerPage: number = 10; // Количество задач на странице

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
        Notificator.debug('RepeatingTasksView.render start');
        this.container.empty();
        this.container.createEl('h2', { text: 'Повторяющиеся задачи' });
        
        // Контейнер для настроек отображения
        const settingsContainer = this.container.createDiv({ cls: 'task-settings-container' });

        // Добавляем фильтр по имени задачи
        const nameFilterContainer = settingsContainer.createDiv({ cls: 'task-filter' });
        nameFilterContainer.createEl('label', { text: 'Поиск по имени: ', attr: { for: 'name-filter' } });
        const nameInput = nameFilterContainer.createEl('input', { 
            attr: { 
                id: 'name-filter',
                type: 'text',
                placeholder: 'Введите имя задачи...',
                value: this.filterName
            }
        });

        // Создаем контейнер для автокомплита
        const autocompleteContainer = nameFilterContainer.createDiv({ cls: 'autocomplete-container' });
        const suggestionsList = autocompleteContainer.createEl('ul', { cls: 'suggestions-list' });
        suggestionsList.style.display = 'none';

        let currentSuggestions: string[] = [];
        let selectedIndex = -1;

        // Функция для обновления списка предложений
        const updateSuggestions = async () => {
            const input = nameInput.value.toLowerCase();
            const taskInstances = await this.taskManager.getTaskInstances();
            const uniqueTaskNames = new Set(taskInstances.map(instance => instance.task.name));
            
            currentSuggestions = Array.from(uniqueTaskNames)
                .filter(name => name.toLowerCase().includes(input))
                .slice(0, 5); // Ограничиваем количество предложений

            suggestionsList.empty();
            selectedIndex = -1;

            if (currentSuggestions.length > 0 && input) {
                currentSuggestions.forEach((suggestion, index) => {
                    const li = suggestionsList.createEl('li', { text: suggestion });
                    li.onclick = () => {
                        nameInput.value = suggestion;
                        this.filterName = suggestion;
                        this.currentPage = 1;
                        suggestionsList.style.display = 'none';
                        this.render();
                    };
                });
                suggestionsList.style.display = 'block';
            } else {
                suggestionsList.style.display = 'none';
            }
        };

        // Обработчик ввода
        nameInput.oninput = () => {
            updateSuggestions();
        };

        // Обработчик клавиш для навигации
        nameInput.onkeydown = (event) => {
            const suggestions = suggestionsList.querySelectorAll('li');

            switch (event.key) {
                case 'Tab':
                    if (currentSuggestions.length > 0) {
                        event.preventDefault();
                        const selectedSuggestion = selectedIndex >= 0 ? currentSuggestions[selectedIndex] : currentSuggestions[0];
                        nameInput.value = selectedSuggestion;
                        this.filterName = selectedSuggestion;
                        this.currentPage = 1;
                        suggestionsList.style.display = 'none';
                        this.render();
                    }
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    if (selectedIndex < suggestions.length - 1) {
                        if (selectedIndex >= 0) {
                            suggestions[selectedIndex].classList.remove('selected');
                        }
                        selectedIndex++;
                        suggestions[selectedIndex].classList.add('selected');
                    }
                    break;

                case 'ArrowUp':
                    event.preventDefault();
                    if (selectedIndex > 0) {
                        suggestions[selectedIndex].classList.remove('selected');
                        selectedIndex--;
                        suggestions[selectedIndex].classList.add('selected');
                    }
                    break;

                case 'Enter':
                    if (selectedIndex >= 0 && currentSuggestions[selectedIndex]) {
                        event.preventDefault();
                        nameInput.value = currentSuggestions[selectedIndex];
                        this.filterName = currentSuggestions[selectedIndex];
                        this.currentPage = 1;
                        suggestionsList.style.display = 'none';
                        this.render();
                    } else {
                        this.filterName = nameInput.value;
                        this.currentPage = 1;
                        suggestionsList.style.display = 'none';
                        this.render();
                    }
                    break;

                case 'Escape':
                    suggestionsList.style.display = 'none';
                    selectedIndex = -1;
                    break;
            }
        };

        // Скрываем список при клике вне
        document.addEventListener('click', (event) => {
            if (!nameFilterContainer.contains(event.target as Node)) {
                suggestionsList.style.display = 'none';
            }
        });

        // Добавляем фильтр по статусу
        const filterContainer = settingsContainer.createDiv({ cls: 'task-filter' });
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
        let filteredInstances = taskInstances;
        
        // Применяем фильтр по статусу
        if (this.filterStatus !== 'all') {
            filteredInstances = filteredInstances.filter(task => task.getStatus() === this.filterStatus);
        }
        
        // Применяем фильтр по имени
        if (this.filterName.trim()) {
            const searchTerm = this.filterName.toLowerCase().trim();
            filteredInstances = filteredInstances.filter(task => 
                task.task.name.toLowerCase().includes(searchTerm)
            );
        }

        // Добавляем настройку количества задач на странице
        const paginationContainer = settingsContainer.createDiv({ cls: 'pagination-settings' });
        paginationContainer.createEl('label', { text: 'Задач на странице: ', attr: { for: 'items-per-page' } });
        const itemsSelect = paginationContainer.createEl('select', { attr: { id: 'items-per-page' } });
        [5, 10, 20, 50, 100].forEach(num => {
            itemsSelect.createEl('option', { text: `${num}`, attr: { value: `${num}` } });
        });
        itemsSelect.value = `${this.itemsPerPage}`;
        itemsSelect.onchange = () => {
            this.itemsPerPage = parseInt(itemsSelect.value);
            this.currentPage = 1; // Сбрасываем на первую страницу при изменении количества элементов
            this.render();
        };
        
        // Добавляем счетчик задач
        const taskCountContainer = this.container.createDiv({ cls: 'task-count-container' });
        if (this.filterStatus === 'all') {
            taskCountContainer.createEl('p', { text: `Всего задач: ${taskInstances.length}`, cls: 'task-count' });
        } else {
            taskCountContainer.createEl('p', { 
                text: `Показано ${filteredInstances.length} из ${taskInstances.length} задач`, 
                cls: 'task-count' 
            });
        }

        if (filteredInstances.length === 0) {
            this.container.createEl('p', { text: 'Задачи не найдены' });
            return;
        }
        
        // Вычисляем пагинацию
        const totalPages = Math.ceil(filteredInstances.length / this.itemsPerPage);
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
        }
        
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, filteredInstances.length);
        const currentPageInstances = filteredInstances.slice(startIndex, endIndex);
        
        // Отображаем текущую страницу и общее количество страниц
        const paginationInfoEl = this.container.createDiv({ cls: 'pagination-info' });
        paginationInfoEl.createEl('p', { 
            text: `Страница ${this.currentPage} из ${totalPages} (показано ${currentPageInstances.length} из ${filteredInstances.length} задач)`,
            cls: 'pagination-text'
        });
        
        // Отображаем только задачи текущей страницы
        currentPageInstances.forEach(task => {
            this.renderTask(task);
        });
        
        // Добавляем элементы навигации по страницам
        if (totalPages > 1) {
            const paginationEl = this.container.createDiv({ cls: 'pagination-controls' });
            
            // Кнопка "Предыдущая страница"
            const prevBtn = paginationEl.createEl('button', { 
                text: '← Предыдущая', 
                cls: 'pagination-button' 
            });
            prevBtn.disabled = this.currentPage === 1;
            prevBtn.onclick = () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.render();
                }
            };
            
            // Номера страниц
            const pagesContainer = paginationEl.createDiv({ cls: 'pagination-pages' });
            
            // Определяем диапазон отображаемых номеров страниц
            const maxVisiblePages = 5;
            let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
            
            if (endPage - startPage + 1 < maxVisiblePages) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }
            
            // Первая страница
            if (startPage > 1) {
                const firstPageBtn = pagesContainer.createEl('button', { 
                    text: '1', 
                    cls: 'pagination-page-button' 
                });
                firstPageBtn.onclick = () => {
                    this.currentPage = 1;
                    this.render();
                };
                
                if (startPage > 2) {
                    pagesContainer.createEl('span', { text: '...', cls: 'pagination-ellipsis' });
                }
            }
            
            // Номера страниц
            for (let i = startPage; i <= endPage; i++) {
                const pageBtn = pagesContainer.createEl('button', { 
                    text: `${i}`, 
                    cls: i === this.currentPage ? 'pagination-page-button current' : 'pagination-page-button' 
                });
                pageBtn.onclick = () => {
                    this.currentPage = i;
                    this.render();
                };
            }
            
            // Последняя страница
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    pagesContainer.createEl('span', { text: '...', cls: 'pagination-ellipsis' });
                }
                
                const lastPageBtn = pagesContainer.createEl('button', { 
                    text: `${totalPages}`, 
                    cls: 'pagination-page-button' 
                });
                lastPageBtn.onclick = () => {
                    this.currentPage = totalPages;
                    this.render();
                };
            }
            
            // Кнопка "Следующая страница"
            const nextBtn = paginationEl.createEl('button', { 
                text: 'Следующая →', 
                cls: 'pagination-button' 
            });
            nextBtn.disabled = this.currentPage === totalPages;
            nextBtn.onclick = () => {
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.render();
                }
            };
        }
        Notificator.debug('RepeatingTasksView.render end');
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
            text: `Состояние: ${taskInstance.getStatus().toUpperCase()}`, 
            cls: `task-state-${taskInstance.getStatus().toLowerCase()}` 
        });

        // Статус просрочки
        const overdueStatus = taskInstance.getOverdueStatus();
        const overdueStatusEl = instanceEl.createDiv({ cls: 'task-status' });
        overdueStatusEl.createEl('span', { 
            text: `Просрочка: ${overdueStatus.toUpperCase()}`, 
            cls: `status-${overdueStatus}` 
        });

        
        const isStartedEl = instanceEl.createDiv();
        isStartedEl.createEl('span', { 
            text: `isStarted: ${taskInstance.isStarted()}`
        });
        const isOverdueEl = instanceEl.createDiv();
        isOverdueEl.createEl('span', { 
            text: `isOverdue: ${taskInstance.isOverdue()}`
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