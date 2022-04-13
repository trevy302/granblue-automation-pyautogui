import { FsTextFileOption, readTextFile, writeFile } from "@tauri-apps/api/fs"
import { Command } from "@tauri-apps/api/shell"
import axios, { AxiosError } from "axios"
import { useContext, useEffect, useState } from "react"
import { BotStateContext, Settings, defaultSettings } from "../../context/BotStateContext"
import { MessageLogContext } from "../../context/MessageLogContext"
import summonData from "../../data/summons.json"

const Start = () => {
    const [PID, setPID] = useState(0)
    const [firstTimeSetup, setFirstTimeSetup] = useState(true)
    const [firstTimeAPIRequest, setFirstTimeAPIRequest] = useState(true)
    const [successfulAPILogin, setSuccessfulAPILogin] = useState(false)

    const messageLogContext = useContext(MessageLogContext)
    const botStateContext = useContext(BotStateContext)

    // Append the messages acquired from the async bot process to the message log. This is needed to actually reflect the new messages to the Home page.
    useEffect(() => {
        const newLog = [...messageLogContext.messageLog, ...messageLogContext.asyncMessages]
        messageLogContext.setMessageLog(newLog)

        if (messageLogContext.asyncMessages.length > 0 && messageLogContext.asyncMessages[messageLogContext.asyncMessages.length - 1].includes("Closing Python process")) {
            handleStop()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messageLogContext.asyncMessages])

    // Start or stop the bot process.
    useEffect(() => {
        if (botStateContext.startBot && !botStateContext.isBotRunning) {
            execute("powershell", "$path=Get-Location \nmd -Force $path/logs/") // Windows-specific
            handleStart()
        } else if (botStateContext.stopBot && botStateContext.isBotRunning) {
            if (PID !== 0) {
                handleStop()
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [botStateContext.startBot, botStateContext.stopBot])

    // Get the current date and time for the filename of the text log file.
    const getCurrentDateAndTime = (separator = "") => {
        let newDate = new Date()
        let date = newDate.getDate()
        let month = newDate.getMonth() + 1
        let year = newDate.getFullYear()

        let hour = newDate.getHours()
        let minute = newDate.getMinutes()
        let second = newDate.getSeconds()

        return `${year}${separator}${month < 10 ? `0${month}` : `${month}`}${separator}${date} ${hour < 10 ? `0${hour}` : `${hour}`}${separator}${
            minute < 10 ? `0${minute}` : `${minute}`
        }${separator}${second < 10 ? `0${second}` : `${second}`}`
    }

    // Attempt to kill the bot process if it is still active.
    const handleStop = async () => {
        if (PID !== 0) {
            botStateContext.setIsBotRunning(false)
            botStateContext.setStartBot(false)
            botStateContext.setStopBot(false)

            console.log("Killing process tree now...")
            const output = await new Command("powershell", `taskkill /F /T /PID ${PID}`).execute() // Windows specific
            console.log(`Result of killing bot process using PID ${PID}: \n${output.stdout}`)
            setPID(0)
        }
    }

    // Load settings from JSON file on program start.
    useEffect(() => {
        try {
            readTextFile("backend/settings.json")
                .then((settings) => {
                    const decoded: Settings = JSON.parse(settings)
                    console.log(`Loaded settings from settings.json: ${JSON.stringify(decoded, null, 4)}`)

                    var fixedSettings: Settings = fixSettings(decoded)

                    // Save the settings to state.
                    botStateContext.setSettings(fixedSettings)

                    setFirstTimeSetup(false)
                })
                .catch((err) => {
                    console.log(`Encountered read exception while loading settings from settings.json ${err}`)
                    setFirstTimeSetup(false)
                })
        } catch (e) {
            console.log(`Encountered exception while loading settings from settings.json: ${e}`)
            messageLogContext.setMessageLog([...messageLogContext.messageLog, `\nEncountered exception while loading settings from local JSON file: ${e}`])
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Attempt to fix missing key-value pairs in the settings before commiting them to state.
    const fixSettings = (decoded: Settings) => {
        var newSettings: Settings = decoded
        Object.keys(defaultSettings).forEach((key) => {
            if (decoded[key as keyof Settings] === undefined) {
                newSettings = {
                    ...newSettings,
                    [key as keyof Settings]: defaultSettings[key as keyof Settings],
                }
            }
        })

        return newSettings
    }

    const fetchSummonElements = (summonList: string[]) => {
        var newSummonElementsList: string[] = []
        summonList.forEach((summon) => {
            if (summonData.Fire.summons.indexOf(summon) !== -1) {
                newSummonElementsList = newSummonElementsList.concat("Fire")
            } else if (summonData.Water.summons.indexOf(summon) !== -1) {
                newSummonElementsList = newSummonElementsList.concat("Water")
            } else if (summonData.Earth.summons.indexOf(summon) !== -1) {
                newSummonElementsList = newSummonElementsList.concat("Earth")
            } else if (summonData.Wind.summons.indexOf(summon) !== -1) {
                newSummonElementsList = newSummonElementsList.concat("Wind")
            } else if (summonData.Light.summons.indexOf(summon) !== -1) {
                newSummonElementsList = newSummonElementsList.concat("Light")
            } else if (summonData.Dark.summons.indexOf(summon) !== -1) {
                newSummonElementsList = newSummonElementsList.concat("Dark")
            } else if (summonData.Misc.summons.indexOf(summon) !== -1) {
                newSummonElementsList = newSummonElementsList.concat("Misc")
            }
        })

        return newSummonElementsList
    }

    // Save current settings to JSON file.
    useEffect(() => {
        if (!firstTimeSetup) {
            try {
                // Grab a local copy of the current settings.
                const localSettings: Settings = botStateContext.settings

                // Find the elements of the support Summons for the Farming Mode first and then for Nightmare if available.
                localSettings.game.summonElements = fetchSummonElements(localSettings.game.summons)
                localSettings.nightmare.nightmareSummonElements = fetchSummonElements(localSettings.nightmare.nightmareSummons)

                // Stringify the contents and prepare for writing to the specified file.
                const jsonString = JSON.stringify(localSettings, null, 4)
                const settingsFile: FsTextFileOption = { path: "backend/settings.json", contents: jsonString }
                writeFile(settingsFile)
                    .then(() => {
                        console.log(`Successfully saved settings to settings.json`)
                    })
                    .catch((err) => {
                        console.log(`Encountered write exception while saving settings to settings.json: ${err}`)
                        messageLogContext.setMessageLog([
                            ...messageLogContext.messageLog,
                            `\nEncountered write exception while saving settings to settings.json: ${err}\nThe current directory or parent directory might be write-protected`,
                        ])
                    })
            } catch (e) {
                console.log(`Encountered exception while saving settings to settings.json:\n${e}`)
                messageLogContext.setMessageLog([...messageLogContext.messageLog, `\nEncountered exception while saving settings to settings.json:\n${e}`])
            }
        }

        handleReady()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [botStateContext.settings])

    // Save current message log to text file inside the /logs/ folder.
    useEffect(() => {
        if (messageLogContext.messageLog.find((message) => message.includes("Child process finished with code")) !== undefined) {
            // Save message log to text file.
            const fileName = `log ${getCurrentDateAndTime("-")}`
            var fileContent = ""
            messageLogContext.messageLog.forEach((message) => {
                fileContent = fileContent.concat(message)
            })
            const logFile: FsTextFileOption = { path: `logs/${fileName}.txt`, contents: fileContent }
            writeFile(logFile)
                .then(() => {
                    console.log(`Successfully saved message log to ${fileName}.txt`)
                })
                .catch((err) => {
                    console.log(`Encountered write exception: ${err}`)
                })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messageLogContext.messageLog])

    // Async function to execute a Tauri API command.
    const execute = async (program: string, args: string | string[]) => {
        await new Command(program, args).execute()
    }

    // Determine whether the program is ready to start.
    const handleReady = () => {
        const farmingMode = botStateContext.settings.game.farmingMode
        if (
            farmingMode !== "Coop" &&
            botStateContext.settings.game.farmingMode !== "Arcarum" &&
            botStateContext.settings.game.farmingMode !== "Arcarum Sandbox" &&
            botStateContext.settings.game.farmingMode !== "Generic" &&
            botStateContext.settings.game.farmingMode !== ""
        ) {
            botStateContext.setReadyStatus(botStateContext.settings.game.item !== "" && botStateContext.settings.game.mission !== "" && botStateContext.settings.game.summons.length !== 0)
        } else if (botStateContext.settings.game.farmingMode === "Coop" || botStateContext.settings.game.farmingMode === "Arcarum" || botStateContext.settings.game.farmingMode === "Arcarum Sandbox") {
            botStateContext.setReadyStatus(botStateContext.settings.game.item !== "" && botStateContext.settings.game.mission !== "")
        } else {
            botStateContext.setReadyStatus(farmingMode === "Generic" && botStateContext.settings.game.item !== "" && botStateContext.settings.game.summons.length !== 0)
        }
    }

    // Begin the bot process here.
    // Note: newlines are not sent over through stdout so they need to be manually added here in the frontend.
    const handleStart = async () => {
        // Construct the shell command using Tauri Command API.
        const command = new Command("python", "backend/main.py")

        // Attach event listeners.
        command.on("close", (data) => {
            const fileName = `log ${getCurrentDateAndTime("-")}`
            let newLog = [...messageLogContext.asyncMessages, `\n\nSaved message log to: ${fileName}.txt`, `\nChild process finished with code ${data.code}`]
            messageLogContext.setAsyncMessages(newLog)
            handleStop()
        })
        command.on("error", (error) => {
            let newLog = [...messageLogContext.asyncMessages, `\nChild process error: ${error}`]
            messageLogContext.setAsyncMessages(newLog)
        })
        command.stdout.on("data", (line: string) => {
            // If the line contains this, then send a API request to Granblue Automation Statistics.
            if (successfulAPILogin && line.includes("API-RESULT")) {
                // Format of the line is API-RESULT|ITEM NAME|ITEM AMOUNT
                let newLog: string[] = []
                const splitLine = line.split("|")
                if (splitLine.length !== 3) {
                    console.log(`Unable to send API request to Granblue Automation Statistics: Invalid request format of ${splitLine.length}.`)
                    newLog = [...messageLogContext.asyncMessages, `\nUnable to send API request to Granblue Automation Statistics: Invalid request format of ${splitLine.length}.`]
                } else if (Number.isNaN(parseInt(splitLine[2]))) {
                    console.log(`Unable to send API request to Granblue Automation Statistics: Invalid type for item amount.`)
                    newLog = [...messageLogContext.asyncMessages, `\nUnable to send API request to Granblue Automation Statistics: Invalid type for item amount.`]
                } else {
                    sendAPIRequest(splitLine[1], parseInt(splitLine[2]))
                }

                newLog = [...newLog, `\n${line}`]
                messageLogContext.setAsyncMessages(newLog)
            } else {
                let newLog = [...messageLogContext.asyncMessages, `\n${line}`]
                messageLogContext.setAsyncMessages(newLog)
            }
        })
        command.stderr.on("data", (line: string) => {
            let newLog = [...messageLogContext.asyncMessages, `\n${line}`]
            messageLogContext.setAsyncMessages(newLog)
        })

        // Login to API.
        await loginToAPI()

        // Create the child process.
        const child = await command.spawn()
        console.log("PID: ", child.pid)
        setPID(child.pid)
        botStateContext.setIsBotRunning(true)
    }

    const loginToAPI = async () => {
        await axios
            .post(
                "https://granblue-automation-statistics.com/api/login",
                {
                    username: botStateContext.settings.api.username,
                    password: botStateContext.settings.api.password,
                },
                {
                    withCredentials: true,
                }
            )
            .then(() => {
                let newLog = [...messageLogContext.asyncMessages, `Successfully logged into Granblue Automation Statistics API.\n`]
                messageLogContext.setAsyncMessages(newLog)
                setSuccessfulAPILogin(true)
            })
            .catch((e: AxiosError) => {
                let newLog = [...messageLogContext.asyncMessages, `Failed to login to Granblue Automation Statistics API: ${e}\n`]
                messageLogContext.setAsyncMessages(newLog)
            })
    }

    // Send a API request to create a new result in the database.
    const sendAPIRequest = (itemName: string, amount: number) => {
        // If this is the first time, create the item if it does not already exist in the database.
        let newLog: string[] = []
        if (firstTimeAPIRequest) {
            axios
                .post(
                    `https://granblue-automation-statistics.com/api/create-item/farmingMode/${botStateContext.settings.game.farmingMode}/${itemName}`,
                    { username: botStateContext.settings.api.username, password: botStateContext.settings.api.password },
                    { withCredentials: true }
                )
                .then(() => {
                    setFirstTimeAPIRequest(false)
                    axios
                        .post(
                            `https://granblue-automation-statistics.com/api/create-result/${botStateContext.settings.api.username}/${botStateContext.settings.game.farmingMode}/${itemName}/GA/${amount}`,
                            { username: botStateContext.settings.api.username, password: botStateContext.settings.api.password },
                            { withCredentials: true }
                        )
                        .then(() => {
                            newLog = [...messageLogContext.asyncMessages, `\nAPI Request successfully resolved.`]
                        })
                        .catch((e: AxiosError) => {
                            newLog = [...messageLogContext.asyncMessages, `\nFailed to create result: ${e}`]
                        })
                        .finally(() => {
                            messageLogContext.setAsyncMessages(newLog)
                        })
                })
                .catch((e: AxiosError) => {
                    console.error(`Failed to create item for the first time: ${e}`)
                    newLog = [...messageLogContext.asyncMessages, `\nFailed to create item for the first time: ${e}`]
                    messageLogContext.setAsyncMessages(newLog)
                })
        } else {
            let newLog: string[] = []
            axios
                .post(
                    `https://granblue-automation-statistics.com/api/create-result/${botStateContext.settings.api.username}/${itemName}/GA/${amount}`,
                    { username: botStateContext.settings.api.username, password: botStateContext.settings.api.password },
                    { withCredentials: true }
                )
                .then(() => {
                    newLog = [...messageLogContext.asyncMessages, `\nAPI Request sent.`]
                })
                .catch((e: AxiosError) => {
                    newLog = [...messageLogContext.asyncMessages, `\nFailed to create result: ${e}`]
                })
                .finally(() => {
                    messageLogContext.setAsyncMessages(newLog)
                })
        }
    }

    return null
}

export default Start
