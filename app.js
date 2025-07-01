document.addEventListener('DOMContentLoaded', () => {
    // MARK: - Data Models
    class TimerStep {
        constructor(type, duration, hasVoiceAction, hasVibrationAction) {
            this.type = type; // "Work" or "Rest"
            this.duration = duration; // in seconds
            this.hasVoiceAction = hasVoiceAction;
            this.hasVibrationAction = hasVibrationAction;
        }
    }

    class TimerConfiguration {
        constructor(name, steps, repeatCount = 1) {
            this.id = this.generateUUID();
            this.name = name;
            this.steps = steps.map(s => new TimerStep(s.type, s.duration, s.hasVoiceAction, s.hasVibrationAction));
            this.repeatCount = repeatCount;
        }

        generateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
    }

    // MARK: - State Management
    let timerConfigurations = [];
    const presetTimerConfigurations = [
        new TimerConfiguration("Focus Study", [
            new TimerStep("Work", 1500, true, true),
            new TimerStep("Rest", 300, true, true)
        ], 3),
        new TimerConfiguration("HIIT", [
            new TimerStep("Work", 30, true, true),
            new TimerStep("Rest", 30, false, true)
        ], 5)
    ];

    const stepDurationOptions = [
        { value: 10, text: "10s" }, { value: 15, text: "15s" }, { value: 20, text: "20s" },
        { value: 30, text: "30s" }, { value: 45, text: "45s" }, { value: 60, text: "1 min" },
        { value: 90, text: "1.5 min" }, { value: 120, text: "2 min" }, { value: 180, text: "3 min" },
        { value: 240, text: "4 min" }, { value: 300, text: "5 min" }, { value: 600, text: "10 min" },
        { value: 900, text: "15 min" }, { value: 1200, text: "20 min" }, { value: 1500, text: "25 min" },
        { value: 1800, text: "30 min" }, { value: 2700, text: "45 min" }, { value: 3600, text: "1 hour" }
    ];

    const svgIcons = {
        play: `<svg class="icon-size" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
        remove: `<svg class="icon-size" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
        add: `<svg class="icon-size" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
        voice: `<svg class="icon-size" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C10.34 2 9 3.34 9 5v6c0 1.66 1.34 3 3 3s3-1.34 3-3V5c0-1.66-1.34-3-3-3zM21 12v1c0 3.87-3.13 7-7 7h-4c-3.87 0-7-3.13-7-7v-1h2v1c0 2.76 2.24 5 5 5h4c2.76 0 5-2.24 5-5v-1h2z"/></svg>`,
        vibration: `<svg class="icon-size" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 4h10c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h10V6H7zM3 7h1v10H3zm17 0h1v10h-1z"/></svg>`
    };

    let synth;
    let timerIntervalId;
    let timerRemainingTime;
    let isTimerPaused = false;
    let currentActiveTimerConfig = null;
    let currentStepIndex = 0;
    let currentRepeatRound = 1;
    let editingTimerId = null;
    let currentCreatingSteps = [];

    // MARK: - DOM Elements
    const configListScreen = document.getElementById('configListScreen');
    const createTimerScreen = document.getElementById('createTimerScreen');
    const timerScreen = document.getElementById('timerScreen');
    const currentTimerDisplay = document.getElementById('currentTimerDisplay');
    const timerScreenTitle = document.getElementById('timerScreenTitle');
    const startButtonTimer = document.getElementById('startButtonTimer');
    const pauseButtonTimer = document.getElementById('pauseButtonTimer');
    const backButton = document.getElementById('backButton');
    const doneScreen = document.getElementById('doneScreen');
    const addCustomTimerButton = document.getElementById('addCustomTimerButton');
    const newTimerNameInput = document.getElementById('newTimerName');
    const timerNameHint = document.getElementById('timerNameHint');
    const timerStepsContainer = document.getElementById('timerStepsContainer');
    const dynamicStepItemsWrapper = document.getElementById('dynamicStepItemsWrapper');
    const addStepButton = document.getElementById('addStepButton');
    const repeatTimesSelect = document.getElementById('repeatTimesSelect');
    const createTimerConfirmButton = document.getElementById('createTimerConfirmButton');
    const cancelCreateTimerButton = document.getElementById('cancelCreateTimerButton');
    const presetTimersList = document.getElementById('presetTimersList');

    // MARK: - Local Storage Functions
    function saveTimersToLocalStorage() {
        localStorage.setItem('smartTimers', JSON.stringify(timerConfigurations));
    }

    function loadTimersFromLocalStorage() {
        const savedTimers = localStorage.getItem('smartTimers');
        if (savedTimers) {
            const parsedTimers = JSON.parse(savedTimers);
            // Re-construct instances to ensure methods like generateUUID are available
            timerConfigurations = parsedTimers.map(t => new TimerConfiguration(t.name, t.steps, t.repeatCount));
        } else {
            // If no saved timers, initialize with a default one
            timerConfigurations = [new TimerConfiguration("Quick Break", [new TimerStep("Work", 60, true, true)], 1)];
        }
    }

    // MARK: - Audio Functions
    function initializeAudio() {
        if (!synth) {
            synth = new Tone.Synth().toDestination();
            console.log("Tone.js synth initialized.");
        }
    }

    async function playSound() {
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
        if (synth) {
            synth.triggerAttackRelease("C4", "8n");
        }
    }

    // MARK: - Timer Logic
    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function updateTimerScreenTitle() {
        if (currentActiveTimerConfig && currentActiveTimerConfig.steps.length > 0) {
            const currentStep = currentActiveTimerConfig.steps[currentStepIndex];
            const totalSteps = currentActiveTimerConfig.steps.length;
            const totalRounds = currentActiveTimerConfig.repeatCount;
            let titleHtml = `${currentActiveTimerConfig.name} - ${currentStep.type}`;
            if (totalRounds > 1 || totalSteps > 1) {
                titleHtml += '<br>';
                let detailText = '';
                if (totalRounds > 1) detailText += `Round ${currentRepeatRound}/${totalRounds}`;
                if (totalSteps > 1) detailText += `${detailText ? ', ' : ''}Step ${currentStepIndex + 1}/${totalSteps}`;
                titleHtml += detailText;
            }
            timerScreenTitle.innerHTML = titleHtml;
        }
    }

    function startTimer() {
        initializeAudio();
        if (timerIntervalId) clearInterval(timerIntervalId);
        isTimerPaused = false;
        startButtonTimer.disabled = true;
        pauseButtonTimer.disabled = false;
        updateTimerScreenTitle();
        timerIntervalId = setInterval(() => {
            if (timerRemainingTime > 0) {
                timerRemainingTime--;
                currentTimerDisplay.textContent = formatTime(timerRemainingTime);
            } else {
                clearInterval(timerIntervalId);
                timerIntervalId = null;
                handleTimerCompletion();
            }
        }, 1000);
    }

    function pauseTimer() {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
        isTimerPaused = true;
        startButtonTimer.disabled = false;
        pauseButtonTimer.disabled = true;
    }

    function handleTimerCompletion() {
        const currentStep = currentActiveTimerConfig.steps[currentStepIndex];
        if (currentActiveTimerConfig && currentStep.hasVoiceAction) {
            playSound();
        }
        if (currentActiveTimerConfig && currentStep.hasVibrationAction && 'vibrate' in navigator) {
            navigator.vibrate(200); // Vibrate for 200ms
        }
        currentStepIndex++;
        if (currentStepIndex < currentActiveTimerConfig.steps.length) {
            timerRemainingTime = currentActiveTimerConfig.steps[currentStepIndex].duration;
            startTimer();
        } else {
            currentRepeatRound++;
            if (currentRepeatRound <= currentActiveTimerConfig.repeatCount) {
                currentStepIndex = 0;
                timerRemainingTime = currentActiveTimerConfig.steps[currentStepIndex].duration;
                startTimer();
            } else {
                showDoneScreen();
            }
        }
    }

    function showDoneScreen() {
        timerScreen.classList.add('hidden');
        doneScreen.classList.add('visible');
        setTimeout(() => {
            doneScreen.classList.remove('visible');
            showConfigList();
        }, 2000);
    }

    // MARK: - Navigation
    function showScreen(screenToShow) {
        [configListScreen, createTimerScreen, timerScreen].forEach(screen => {
            screen.classList.add('hidden');
        });
        screenToShow.classList.remove('hidden');
    }

    function showTimerScreen(configId, isPreset = false) {
        const sourceArray = isPreset ? presetTimerConfigurations : timerConfigurations;
        const selectedConfig = sourceArray.find(c => c.id === configId);
        if (selectedConfig && selectedConfig.steps && selectedConfig.steps.length > 0) {
            currentActiveTimerConfig = selectedConfig;
            currentStepIndex = 0;
            currentRepeatRound = 1;
            timerRemainingTime = currentActiveTimerConfig.steps[currentStepIndex].duration;
            isTimerPaused = false;
            currentTimerDisplay.textContent = formatTime(timerRemainingTime);
            updateTimerScreenTitle();
            startButtonTimer.disabled = false;
            pauseButtonTimer.disabled = true;
            showScreen(timerScreen);
            startTimer();
        } else {
            showConfigList();
        }
    }

    function showConfigList() {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
        isTimerPaused = false;
        currentActiveTimerConfig = null;
        currentStepIndex = 0;
        currentRepeatRound = 1;
        editingTimerId = null;
        createTimerConfirmButton.textContent = 'Submit';
        newTimerNameInput.classList.remove('input-invalid');
        timerNameHint.classList.add('hidden');
        renderTimerConfigurations();
        renderPresetTimerConfigurations();
        showScreen(configListScreen);
    }

    function showCreateTimerScreen(configId = null, isPreset = false) {
        newTimerNameInput.value = '';
        timerNameHint.classList.add('hidden');
        newTimerNameInput.classList.remove('input-invalid');
        let configToLoad = null;
        if (isPreset) {
            configToLoad = presetTimerConfigurations.find(c => c.id === configId);
            if (configToLoad) {
                editingTimerId = null;
                newTimerNameInput.value = configToLoad.name;
                currentCreatingSteps = configToLoad.steps.map(s => new TimerStep(s.type, s.duration, s.hasVoiceAction, s.hasVibrationAction));
                repeatTimesSelect.value = configToLoad.repeatCount;
                createTimerConfirmButton.textContent = 'Submit';
            }
        } else if (configId) {
            editingTimerId = configId;
            configToLoad = timerConfigurations.find(c => c.id === configId);
            if (configToLoad) {
                newTimerNameInput.value = configToLoad.name;
                currentCreatingSteps = configToLoad.steps.map(s => new TimerStep(s.type, s.duration, s.hasVoiceAction, s.hasVibrationAction));
                repeatTimesSelect.value = configToLoad.repeatCount;
                createTimerConfirmButton.textContent = 'Submit';
            }
        } else {
            editingTimerId = null;
            currentCreatingSteps = [new TimerStep("Work", 60, true, true)];
            repeatTimesSelect.value = 1;
            createTimerConfirmButton.textContent = 'Submit';
        }

        repeatTimesSelect.innerHTML = '';
        for (let i = 1; i <= 10; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i}x`;
            repeatTimesSelect.appendChild(option);
        }
        if (configToLoad) repeatTimesSelect.value = configToLoad.repeatCount;
        else repeatTimesSelect.value = 1;

        renderCreateTimerSteps();
        showScreen(createTimerScreen);
    }

    // MARK: - Render Functions
    function renderTimerConfigurations() {
        const listElement = document.getElementById('timerConfigList');
        listElement.innerHTML = '';
        if (timerConfigurations.length === 0) {
            const noTimersMessage = document.createElement('li');
            noTimersMessage.className = 'text-center text-gray-500 py-4';
            noTimersMessage.textContent = 'No custom timers yet. Create one!';
            listElement.appendChild(noTimersMessage);
        }
        timerConfigurations.forEach((config, index) => {
            const listItem = document.createElement('li');
            listItem.className = 'config-item';
            listItem.addEventListener('click', (e) => {
                if (!e.target.closest('.action-button')) showCreateTimerScreen(config.id);
            });

            let totalDuration = config.steps.reduce((acc, s) => acc + s.duration, 0) * config.repeatCount;
            let workTime = config.steps.filter(s => s.type === 'Work').reduce((acc, s) => acc + s.duration, 0) * config.repeatCount;
            let restTime = config.steps.filter(s => s.type === 'Rest').reduce((acc, s) => acc + s.duration, 0) * config.repeatCount;
            let repeatText = config.repeatCount > 1 ? `, Repeat: ${config.repeatCount}x` : '';

            listItem.innerHTML = `
                <span class="item-index">${index + 1}</span>
                <span class="item-name">${config.name} (Total: ${formatTime(totalDuration)}, W: ${formatTime(workTime)}, R: ${formatTime(restTime)}${repeatText})</span>
                <div class="flex items-center gap-4">
                    <button class="action-button start-button" aria-label="Start ${config.name}">${svgIcons.play}</button>
                    <button class="action-button remove-button" aria-label="Remove ${config.name}">${svgIcons.remove}</button>
                </div>
            `;
            listItem.querySelector('.start-button').addEventListener('click', (e) => { e.stopPropagation(); showTimerScreen(config.id); });
            listItem.querySelector('.remove-button').addEventListener('click', (e) => {
                e.stopPropagation();
                const indexToRemove = timerConfigurations.findIndex(c => c.id === config.id);
                if (indexToRemove > -1) {
                    timerConfigurations.splice(indexToRemove, 1);
                    saveTimersToLocalStorage();
                    renderTimerConfigurations();
                }
            });
            listElement.appendChild(listItem);
        });
    }

    function renderPresetTimerConfigurations() {
        presetTimersList.innerHTML = '';
        presetTimerConfigurations.forEach(presetConfig => {
            const listItem = document.createElement('li');
            listItem.className = 'preset-item';
            listItem.addEventListener('click', (e) => {
                if (!e.target.closest('.action-button')) showCreateTimerScreen(presetConfig.id, true);
            });

            let totalDuration = presetConfig.steps.reduce((acc, s) => acc + s.duration, 0) * presetConfig.repeatCount;
            let workTime = presetConfig.steps.filter(s => s.type === 'Work').reduce((acc, s) => acc + s.duration, 0) * presetConfig.repeatCount;
            let restTime = presetConfig.steps.filter(s => s.type === 'Rest').reduce((acc, s) => acc + s.duration, 0) * presetConfig.repeatCount;
            let repeatText = presetConfig.repeatCount > 1 ? `, Repeat: ${presetConfig.repeatCount}x` : '';

            listItem.innerHTML = `
                <span class="item-name">${presetConfig.name} (Total: ${formatTime(totalDuration)}, W: ${formatTime(workTime)}, R: ${formatTime(restTime)}${repeatText})</span>
                <div class="flex items-center gap-4">
                    <button class="action-button start-button" aria-label="Start ${presetConfig.name}">${svgIcons.play}</button>
                    <button class="action-button add-preset-button" aria-label="Add ${presetConfig.name} to custom timers">${svgIcons.add}</button>
                </div>
            `;
            listItem.querySelector('.start-button').addEventListener('click', (e) => { e.stopPropagation(); showTimerScreen(presetConfig.id, true); });
            listItem.querySelector('.add-preset-button').addEventListener('click', (e) => {
                e.stopPropagation();
                timerConfigurations.push(new TimerConfiguration(presetConfig.name, presetConfig.steps, presetConfig.repeatCount));
                saveTimersToLocalStorage();
                renderTimerConfigurations();
            });
            presetTimersList.appendChild(listItem);
        });
    }

    function renderCreateTimerSteps() {
        dynamicStepItemsWrapper.innerHTML = '';
        currentCreatingSteps.forEach((step, index) => {
            const stepItemDiv = document.createElement('div');
            stepItemDiv.className = 'timer-step-item';

            const durationOptionsHtml = stepDurationOptions.map(opt => `<option value="${opt.value}" ${step.duration === opt.value ? 'selected' : ''}>${opt.text}</option>`).join('');
            const isDurationPredefined = stepDurationOptions.some(opt => opt.value === step.duration);
            const customDurationOption = !isDurationPredefined ? `<option value="${step.duration}" selected>${formatTime(step.duration)}</option>` : '';

            stepItemDiv.innerHTML = `
                <span class="step-index">${index + 1}</span>
                <select class="step-label-select" data-step-property="type">
                    <option value="Work" ${step.type === "Work" ? 'selected' : ''}>Work</option>
                    <option value="Rest" ${step.type === "Rest" ? 'selected' : ''}>Rest</option>
                </select>
                <select class="step-duration-select" data-step-property="duration">
                    ${customDurationOption}
                    ${durationOptionsHtml}
                </select>
                <label class="step-action-checkbox" title="Voice Alert">
                    <input type="checkbox" ${step.hasVoiceAction ? 'checked' : ''} data-action="voice">
                    ${svgIcons.voice}
                </label>
                <label class="step-action-checkbox" title="Vibration Alert">
                    <input type="checkbox" ${step.hasVibrationAction ? 'checked' : ''} data-action="vibration">
                    ${svgIcons.vibration}
                </label>
                <button class="remove-step-item-button" aria-label="Remove Step ${index + 1}">${svgIcons.remove}</button>
            `;

            stepItemDiv.querySelector('[data-step-property="type"]').addEventListener('change', (e) => { currentCreatingSteps[index].type = e.target.value; });
            stepItemDiv.querySelector('[data-step-property="duration"]').addEventListener('change', (e) => { currentCreatingSteps[index].duration = parseInt(e.target.value, 10); });
            stepItemDiv.querySelector('[data-action="voice"]').addEventListener('change', (e) => { currentCreatingSteps[index].hasVoiceAction = e.target.checked; });
            stepItemDiv.querySelector('[data-action="vibration"]').addEventListener('change', (e) => { currentCreatingSteps[index].hasVibrationAction = e.target.checked; });
            const removeButton = stepItemDiv.querySelector('.remove-step-item-button');
            removeButton.addEventListener('click', () => {
                if (currentCreatingSteps.length > 1) {
                    currentCreatingSteps.splice(index, 1);
                    renderCreateTimerSteps();
                } else {
                    alert("You must have at least one step in your timer.");
                }
            });
            if (currentCreatingSteps.length <= 1) removeButton.disabled = true;

            dynamicStepItemsWrapper.appendChild(stepItemDiv);
        });
    }

    // MARK: - Event Listeners
    startButtonTimer.addEventListener('click', startTimer);
    pauseButtonTimer.addEventListener('click', pauseTimer);
    backButton.addEventListener('click', showConfigList);
    addCustomTimerButton.addEventListener('click', () => showCreateTimerScreen(null));
    cancelCreateTimerButton.addEventListener('click', showConfigList);

    createTimerConfirmButton.addEventListener('click', () => {
        const name = newTimerNameInput.value.trim();
        if (!name) {
            timerNameHint.textContent = 'Please enter a timer name.';
            timerNameHint.classList.remove('hidden');
            newTimerNameInput.classList.add('input-invalid');
            return;
        }
        timerNameHint.classList.add('hidden');
        newTimerNameInput.classList.remove('input-invalid');

        if (currentCreatingSteps.length === 0) {
            alert('Please add at least one step to your timer.');
            return;
        }

        const selectedRepeatCount = parseInt(repeatTimesSelect.value, 10);

        if (editingTimerId) {
            const indexToUpdate = timerConfigurations.findIndex(c => c.id === editingTimerId);
            if (indexToUpdate > -1) {
                timerConfigurations[indexToUpdate].name = name;
                timerConfigurations[indexToUpdate].steps = currentCreatingSteps;
                timerConfigurations[indexToUpdate].repeatCount = selectedRepeatCount;
            }
        } else {
            timerConfigurations.push(new TimerConfiguration(name, currentCreatingSteps, selectedRepeatCount));
        }
        saveTimersToLocalStorage();
        showConfigList();
    });

    newTimerNameInput.addEventListener('input', () => {
        timerNameHint.classList.add('hidden');
        newTimerNameInput.classList.remove('input-invalid');
    });

    addStepButton.addEventListener('click', () => {
        currentCreatingSteps.push(new TimerStep("Work", 60, true, true));
        renderCreateTimerSteps();
    });

    document.body.addEventListener('click', initializeAudio, { once: true });

    // MARK: - Initial Load
    loadTimersFromLocalStorage();
    showConfigList();
});