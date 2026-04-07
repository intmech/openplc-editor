import * as Tabs from '@radix-ui/react-tabs'
import { useOpenPLCStore } from '@root/renderer/store'
import type { EtherCATDevice, NetworkInterface } from '@root/types/ethercat'
import type {
  ConfiguredEtherCATDevice,
  ESIRepositoryItemLight,
  ScannedDeviceMatch,
} from '@root/types/ethercat/esi-types'
import type { EtherCATMasterConfig } from '@root/types/PLC/open-plc'
import { cn } from '@root/utils'
import { createDefaultSlaveConfig } from '@root/utils/ethercat/device-config-defaults'
import { countMatchedDevices, getBestMatchQuality, matchDevicesToRepository } from '@root/utils/ethercat/device-matcher'
import { enrichDeviceData } from '@root/utils/ethercat/enrich-device-data'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

import { AdvancedTab } from './components/advanced-tab'
import { RepositoryTab } from './components/repository-tab'
import { ScanBusTab } from './components/scan-bus-tab'

type EditorTab = 'scan-bus' | 'repository' | 'advanced'

const TabItem = ({
  value,
  label,
  isActive,
  badge,
}: {
  value: string
  label: string
  isActive: boolean
  badge?: React.ReactNode
}) => (
  <Tabs.Trigger
    value={value}
    className={cn(
      'px-4 py-2 font-caption !text-xs font-medium transition-colors',
      'border-b-2 border-transparent',
      'hover:text-brand-medium dark:hover:text-brand-light',
      isActive
        ? 'border-brand-medium text-brand-medium dark:border-brand-light dark:text-brand-light'
        : 'text-neutral-500 dark:text-neutral-400',
    )}
  >
    {label}
    {badge}
  </Tabs.Trigger>
)

/**
 * EtherCAT Bus Editor
 *
 * Three-tab layout:
 * - Scan Bus: Network interface selection and device discovery/scanning
 * - Repository: ESI file repository management
 * - Advanced: Master configuration (enable plugin, cycle time, watchdog)
 *
 * Individual device configuration (I/O mapping, SDO, etc.) is handled by
 * EtherCATDeviceEditor, opened from the project tree.
 */
const EtherCATEditor = () => {
  const { editor, runtimeConnection, project, projectActions, workspaceActions } = useOpenPLCStore()

  const deviceName = editor.type === 'plc-remote-device' ? editor.meta.name : ''
  const projectPath = project.meta.path

  // Runtime connection state
  const { connectionStatus, jwtToken, ipAddress } = runtimeConnection
  const isConnectedToRuntime = connectionStatus === 'connected' && ipAddress !== null && jwtToken !== null

  // Tab state
  const [activeTab, setActiveTab] = useState<EditorTab>('scan-bus')

  // Repository state
  const [repository, setRepository] = useState<ESIRepositoryItemLight[]>([])
  const [isLoadingRepository, setIsLoadingRepository] = useState(false)
  const [repositoryError, setRepositoryError] = useState<string | null>(null)
  const [repositoryLoadRetry, setRepositoryLoadRetry] = useState(0)
  const repositoryLoadedRef = useRef(false)

  // Configured devices from Zustand store
  const remoteDevice = useMemo(() => {
    return project.data.remoteDevices?.find((d) => d.name === deviceName)
  }, [project.data.remoteDevices, deviceName])

  const configuredDevices = useMemo(() => {
    return (remoteDevice?.ethercatConfig?.devices ?? []) as ConfiguredEtherCATDevice[]
  }, [remoteDevice])

  const masterConfig = useMemo(() => {
    return (
      remoteDevice?.ethercatConfig?.masterConfig ?? {
        networkInterface: 'eth0',
        cycleTimeUs: 1000,
        watchdogTimeoutCycles: 3,
      }
    )
  }, [remoteDevice])

  const syncDevicesToStore = useCallback(
    (devices: ConfiguredEtherCATDevice[]) => {
      projectActions.updateEthercatConfig(deviceName, { masterConfig, devices })
      workspaceActions.setEditingState('unsaved')
    },
    [deviceName, projectActions, masterConfig, workspaceActions],
  )

  const handleUpdateMasterConfig = useCallback(
    (updates: Partial<EtherCATMasterConfig>) => {
      const newMasterConfig = { ...masterConfig, ...updates }
      projectActions.updateEthercatConfig(deviceName, {
        masterConfig: newMasterConfig,
        devices: configuredDevices,
      })
      workspaceActions.setEditingState('unsaved')
    },
    [deviceName, projectActions, masterConfig, configuredDevices, workspaceActions],
  )

  // Network interfaces state
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([])
  const [selectedInterface, _setSelectedInterface] = useState<string>('')
  const setSelectedInterface = useCallback(
    (value: string) => {
      _setSelectedInterface(value)
      handleUpdateMasterConfig({ networkInterface: value })
    },
    [handleUpdateMasterConfig],
  )
  const [isLoadingInterfaces, setIsLoadingInterfaces] = useState(false)
  const [interfaceError, setInterfaceError] = useState<string | null>(null)

  // EtherCAT service status
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null)
  const [serviceMessage, setServiceMessage] = useState<string>('')

  // Scan state
  const [scannedDevices, setScannedDevices] = useState<EtherCATDevice[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanMessage, setScanMessage] = useState<string>('')
  const [scanTimeMs, setScanTimeMs] = useState<number | null>(null)

  // Discovery selection state
  const [selectedScannedDevices, setSelectedScannedDevices] = useState<Set<number>>(new Set())

  // Matched devices
  const deviceMatches = useMemo<ScannedDeviceMatch[]>(() => {
    return matchDevicesToRepository(scannedDevices, repository)
  }, [scannedDevices, repository])

  const matchCounts = useMemo(() => countMatchedDevices(deviceMatches), [deviceMatches])

  // Check EtherCAT service status
  const checkServiceStatus = useCallback(async () => {
    if (!isConnectedToRuntime || !ipAddress || !jwtToken) {
      setServiceAvailable(null)
      setServiceMessage('')
      return
    }

    try {
      const result = await window.bridge.etherCATGetStatus(ipAddress, jwtToken)
      if (result.success && result.data) {
        setServiceAvailable(result.data.available)
        setServiceMessage(result.data.message)
      } else {
        setServiceAvailable(false)
        setServiceMessage(result.error || 'Failed to check service status')
      }
    } catch (error) {
      setServiceAvailable(false)
      setServiceMessage(String(error))
    }
  }, [isConnectedToRuntime, ipAddress, jwtToken])

  // Fetch network interfaces from runtime
  const fetchInterfaces = useCallback(async () => {
    if (!isConnectedToRuntime || !ipAddress || !jwtToken) {
      setInterfaces([])
      setInterfaceError('Not connected to runtime')
      return
    }

    setIsLoadingInterfaces(true)
    setInterfaceError(null)

    try {
      const result = await window.bridge.etherCATGetInterfaces(ipAddress, jwtToken)
      if (result.success && result.data) {
        const fetchedInterfaces = result.data
        setInterfaces(fetchedInterfaces)
        const names = new Set(fetchedInterfaces.map((i) => i.name))
        if (fetchedInterfaces.length > 0) {
          _setSelectedInterface((prev) => {
            const next = prev && names.has(prev) ? prev : fetchedInterfaces[0].name
            handleUpdateMasterConfig({ networkInterface: next })
            return next
          })
        } else {
          setSelectedInterface('')
        }
      } else {
        setInterfaces([])
        setInterfaceError(result.error || 'Failed to fetch interfaces')
      }
    } catch (error) {
      setInterfaces([])
      setInterfaceError(String(error))
    } finally {
      setIsLoadingInterfaces(false)
    }
  }, [isConnectedToRuntime, ipAddress, jwtToken])

  // Scan for EtherCAT devices
  const scanDevices = useCallback(async () => {
    if (!isConnectedToRuntime || !ipAddress || !jwtToken || !selectedInterface) {
      setScanError('Please select a network interface')
      return
    }

    setIsScanning(true)
    setScanError(null)
    setScanMessage('')
    setScannedDevices([])
    setSelectedScannedDevices(new Set())
    setScanTimeMs(null)

    try {
      const result = await window.bridge.etherCATScan(ipAddress, jwtToken, {
        interface: selectedInterface,
        timeout_ms: 5000,
      })

      if (result.success && result.data) {
        setScannedDevices(result.data.devices)
        setScanMessage(result.data.message)
        setScanTimeMs(result.data.scan_time_ms)

        if (result.data.status !== 'success') {
          setScanError(`Scan completed with status: ${result.data.status}`)
        }
      } else {
        setScanError(result.error || 'Scan failed')
      }
    } catch (error) {
      setScanError(String(error))
    } finally {
      setIsScanning(false)
    }
  }, [isConnectedToRuntime, ipAddress, jwtToken, selectedInterface])

  // Reset repository loaded flag when project changes
  useEffect(() => {
    repositoryLoadedRef.current = false
  }, [projectPath])

  // Load ESI repository
  useEffect(() => {
    let cancelled = false

    const loadRepository = async () => {
      if (!projectPath || repositoryLoadedRef.current) return

      setIsLoadingRepository(true)
      setRepositoryError(null)

      try {
        const result = await window.bridge.esiLoadRepositoryLight(projectPath)
        if (cancelled) return

        if (result.success && result.items) {
          setRepository(result.items)
          repositoryLoadedRef.current = true
        } else if (result.needsMigration) {
          // One-time migration from v1 to v2
          const migrationResult = await window.bridge.esiMigrateRepository(projectPath)
          if (cancelled) return
          if (migrationResult.success && migrationResult.items) {
            setRepository(migrationResult.items)
            repositoryLoadedRef.current = true
          } else {
            setRepositoryError(migrationResult.error || 'Failed to migrate repository')
          }
        } else if (result.error) {
          setRepositoryError(result.error)
        } else {
          repositoryLoadedRef.current = true
        }
      } catch (error) {
        if (cancelled) return
        console.error('Failed to load ESI repository:', error)
        setRepositoryError(String(error))
      } finally {
        if (!cancelled) setIsLoadingRepository(false)
      }
    }

    void loadRepository()
    return () => {
      cancelled = true
    }
  }, [projectPath, repositoryLoadRetry])

  // Check service status and fetch interfaces when runtime connection changes
  useEffect(() => {
    if (isConnectedToRuntime) {
      void checkServiceStatus()
      void fetchInterfaces()
    } else {
      setServiceAvailable(null)
      setInterfaces([])
      setScannedDevices([])
      setSelectedInterface('')
    }
  }, [isConnectedToRuntime, checkServiceStatus, fetchInterfaces])

  // Initialize ethercatConfig in store if missing
  useEffect(() => {
    if (remoteDevice && !remoteDevice.ethercatConfig) {
      projectActions.updateEthercatConfig(deviceName, {
        masterConfig: { networkInterface: 'eth0', cycleTimeUs: 1000, watchdogTimeoutCycles: 3 },
        devices: [],
      })
    }
  }, [remoteDevice, deviceName, projectActions])

  // Discovery handlers
  const handleSelectScannedDevice = useCallback((position: number, selected: boolean) => {
    setSelectedScannedDevices((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(position)
      } else {
        next.delete(position)
      }
      return next
    })
  }, [])

  const handleSelectAllScanned = useCallback(
    (selected: boolean) => {
      if (selected) {
        const selectable = deviceMatches
          .filter((dm) => getBestMatchQuality(dm.matches) !== 'none')
          .map((dm) => dm.device.position)
        setSelectedScannedDevices(new Set(selectable))
      } else {
        setSelectedScannedDevices(new Set())
      }
    },
    [deviceMatches],
  )

  const handleAddSelectedFromScan = useCallback(async () => {
    const newDevices: ConfiguredEtherCATDevice[] = []
    const existingPositions = new Set(configuredDevices.map((d) => d.position))

    for (const position of selectedScannedDevices) {
      // Skip devices already configured at this position
      if (existingPositions.has(position)) continue
      const match = deviceMatches.find((dm) => dm.device.position === position)
      if (!match || match.matches.length === 0) continue

      // Use the best match (first one, which is sorted by quality)
      const bestMatch = match.matches[0]
      const repoItem = repository.find((r) => r.id === bestMatch.repositoryItemId)
      if (!repoItem) continue

      let enriched = {}
      const result = await window.bridge.esiLoadDeviceFull(
        projectPath,
        bestMatch.repositoryItemId,
        bestMatch.deviceIndex,
      )
      if (result.success && result.device) {
        enriched = enrichDeviceData(result.device)
      }

      newDevices.push({
        id: uuidv4(),
        position: match.device.position,
        name: match.device.name,
        esiDeviceRef: {
          repositoryItemId: bestMatch.repositoryItemId,
          deviceIndex: bestMatch.deviceIndex,
        },
        vendorId: repoItem.vendor.id,
        productCode: bestMatch.esiDevice.type.productCode,
        revisionNo: bestMatch.esiDevice.type.revisionNo,
        addedFrom: 'scan',
        config: createDefaultSlaveConfig(),
        channelMappings: [],
        ...enriched,
      })
    }

    if (newDevices.length > 0) {
      syncDevicesToStore([...configuredDevices, ...newDevices])
      setSelectedScannedDevices(new Set())
    }
  }, [selectedScannedDevices, deviceMatches, repository, configuredDevices, syncDevicesToStore, projectPath])

  const handleRetryRepository = useCallback(() => {
    setRepositoryError(null)
    repositoryLoadedRef.current = false
    setRepositoryLoadRetry((c) => c + 1)
  }, [])

  return (
    <div aria-label='EtherCAT editor container' className='flex h-full w-full flex-col overflow-hidden p-4'>
      {/* Header */}
      <div className='mb-4 shrink-0'>
        <h2 className='text-lg font-semibold text-neutral-1000 dark:text-neutral-100'>EtherCAT Bus: {deviceName}</h2>
        <p className='text-sm text-neutral-600 dark:text-neutral-400'>EtherCAT Master Configuration</p>
      </div>

      {/* Tabs */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as EditorTab)}
        className='flex min-h-0 flex-1 flex-col overflow-hidden'
      >
        <Tabs.List className='flex shrink-0 border-b border-neutral-200 dark:border-neutral-700'>
          <TabItem
            value='scan-bus'
            label='Scan Bus'
            isActive={activeTab === 'scan-bus'}
            badge={
              scannedDevices.length > 0 ? (
                <span className='ml-1 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] dark:bg-neutral-700'>
                  {scannedDevices.length}
                </span>
              ) : undefined
            }
          />
          <TabItem
            value='repository'
            label='Repository'
            isActive={activeTab === 'repository'}
            badge={
              repository.length > 0 ? (
                <span className='ml-1 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] dark:bg-neutral-700'>
                  {repository.length}
                </span>
              ) : undefined
            }
          />
          <TabItem value='advanced' label='Advanced' isActive={activeTab === 'advanced'} />
        </Tabs.List>

        {/* Scan Bus Tab */}
        <Tabs.Content
          value='scan-bus'
          className='flex min-h-0 flex-1 flex-col overflow-hidden pt-4 data-[state=inactive]:hidden'
        >
          <ScanBusTab
            isConnectedToRuntime={isConnectedToRuntime}
            serviceAvailable={serviceAvailable}
            serviceMessage={serviceMessage}
            interfaces={interfaces}
            selectedInterface={selectedInterface}
            onSelectInterface={setSelectedInterface}
            isLoadingInterfaces={isLoadingInterfaces}
            interfaceError={interfaceError}
            onRefreshInterfaces={() => void fetchInterfaces()}
            isScanning={isScanning}
            scanError={scanError}
            scanTimeMs={scanTimeMs}
            scanMessage={scanMessage}
            scannedDevices={scannedDevices}
            onScan={() => void scanDevices()}
            deviceMatches={deviceMatches}
            matchCounts={matchCounts}
            selectedScannedDevices={selectedScannedDevices}
            onSelectScannedDevice={handleSelectScannedDevice}
            onSelectAllScanned={handleSelectAllScanned}
            onAddSelectedFromScan={() => void handleAddSelectedFromScan()}
          />
        </Tabs.Content>

        {/* Repository Tab */}
        <Tabs.Content
          value='repository'
          className='flex min-h-0 flex-1 flex-col overflow-hidden pt-4 data-[state=inactive]:hidden'
        >
          <RepositoryTab
            repository={repository}
            onRepositoryChange={setRepository}
            projectPath={projectPath}
            isLoadingRepository={isLoadingRepository}
            repositoryError={repositoryError}
            onRetryRepository={handleRetryRepository}
          />
        </Tabs.Content>

        {/* Advanced Tab */}
        <Tabs.Content
          value='advanced'
          className='flex min-h-0 flex-1 flex-col overflow-hidden pt-4 data-[state=inactive]:hidden'
        >
          <AdvancedTab masterConfig={masterConfig} onUpdateMasterConfig={handleUpdateMasterConfig} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}

export { EtherCATEditor }
