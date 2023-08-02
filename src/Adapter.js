const Device = require('./Device')
const BusHelper = require('./BusHelper')
const buildTypedValue = require('./buildTypedValue')

const DEFAULT_TIMEOUT = 2 * 60 * 1000
const DEFAULT_DISCOVERY_INTERVAL = 1000

/**
 * @classdesc Adapter class interacts with the local bluetooth adapter
 * @class Adapter
 * @see You can construct an Adapter session via {@link Bluetooth#getAdapter} method
 */
class Adapter {
  constructor (dbus, adapter) {
    this.dbus = dbus
    this.adapter = adapter
    this.helper = new BusHelper(dbus, 'org.bluez', `/org/bluez/${adapter}`, 'org.bluez.Adapter1')
  }

  /**
   * The Bluetooth device address.
   * @async
   * @returns {string}
   */
  async getAddress () {
    return this.helper.prop('Address')
  }

  /**
   * The Bluetooth device Address Type. (public, random)
   * @async
   * @returns {string}
   */
  async getAddressType () {
    return this.helper.prop('AddressType')
  }

  /**
   * The Bluetooth system name
   * @async
   * @returns {string}
   */
  async getName () {
    return this.helper.prop('Name')
  }

  /**
   * The Bluetooth friendly name.
   * @async
   * @returns {string}
   */
  async getAlias () {
    return this.helper.prop('Alias')
  }

  /**
   * Current adapter state.
   * @async
   * @returns {boolean}
   */
  async isPowered () {
    return this.helper.prop('Powered')
  }

  /**
   * Indicates that a device discovery procedure is active.
   * @async
   * @returns {boolean}
   */
  async isDiscovering () {
    return this.helper.prop('Discovering')
  }

  /**
   * This method starts the device discovery session.
   * @async
   */
  async startDiscovery (options = {}) {
    if (await this.isDiscovering()) {
      throw new Error('Discovery already in progress')
    }
    if (typeof options !== 'object') {
      throw new Error('Wrong parameter')
    }
    options = Object.assign({ transport: 'le', duplicateData: true }, options)
    await this.helper.callMethod('SetDiscoveryFilter', {
      Transport: buildTypedValue('string', options.transport),
      DuplicateData: buildTypedValue('boolean', options.duplicateData)
    })
    await this.helper.callMethod('StartDiscovery')
  }

  /**
   * This method will cancel any previous StartDiscovery transaction.
   * @async
   */
  async stopDiscovery () {
    if (!await this.isDiscovering()) {
      throw new Error('No discovery started')
    }
    await this.helper.callMethod('StopDiscovery')
  }

  /**
   * List of found device names (uuid).
   * @async
   * @returns {string[]}
   */
  async devices () {
    const devices = await this.helper.children()
    return devices.map(Adapter.deserializeUUID)
  }

  /**
   * Init a device instance and returns it.
   * @param {string} uuid - Device Name.
   * @async
   * @returns {Device}
   */
  async getDevice (uuid) {
    const serializedUUID = Adapter.serializeUUID(uuid)

    const devices = await this.helper.children()
    if (!devices.includes(serializedUUID)) {
      throw new Error('Device not found')
    }

    return new Device(this.dbus, this.adapter, serializedUUID)
  }

  /**
   * Wait that a specific device is found, then init a device instance and returns it.
   * @param {string} uuid - Device Name.
   * @param {number} [timeout = 120000] - Time (ms) to wait before throwing a timeout expection.
   * @param {number} [discoveryInterval = 1000] - Interval (ms) frequency that verifies device availability.
   * @async
   * @returns {Device}
   */
  async waitDevice(uuid, timeout = DEFAULT_TIMEOUT, discoveryInterval = DEFAULT_DISCOVERY_INTERVAL) {
    // this should be optimized subscribing InterfacesAdded signal
    const cancellable = []
    const clearTimers = () => {
      for(const cancel of cancellable) {
        cancel()
      }
    }
    const device = await new Promise(async (resolve, reject) => {
      const check = () => {
        this.getDevice(uuid)
          .then(device => {
            resolve(device)
            clearTimers()
          })
          .catch(e => {
            if (e.message !== 'Device not found') {
              return e
            }
          })
      }

      const intervalHandler = setInterval(check, discoveryInterval)
      const timeoutHandler = setTimeout(() => {
        reject(new Error('operation timed out'))
        clearTimers()
      }, timeout)
      cancellable.push(() => clearInterval(intervalHandler))
      cancellable.push(() => clearTimeout(timeoutHandler))
      check()
    });

    return device;
  }

  /**
   * Human readable class identifier.
   * @async
   * @returns {string}
   */
  async toString () {
    const name = await this.getName()
    const address = await this.getAddress()

    return `${name} [${address}]`
  }

  static serializeUUID (uuid) {
    return `dev_${uuid.replace(/:/g, '_')}`
  }

  static deserializeUUID (uuid) {
    return uuid.substring(4).replace(/_/g, ':')
  }
}

module.exports = Adapter
