import { computed, Ref, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import useWeb3 from '@/services/web3/useWeb3';

import useRelayerApprovalQuery from '../queries/useRelayerApprovalQuery';

import useTransactions from '../useTransactions';
import useEthers from '../useEthers';
import { configService } from '@/services/config/config.service';

import vaultAbi from '@/lib/abi/Vault.json';
import { sendTransaction } from '@/lib/utils/balancer/web3';

export default function useBatchRelayerApproval(isStETHTrade: Ref<boolean>) {
  /**
   * STATE
   */
  const approving = ref(false);
  const approved = ref(false);
  const batchRelayerAddress = ref(configService.network.addresses.batchRelayer);

  /**
   * COMPOSABLES
   */
  const { getProvider, account } = useWeb3();

  const { txListener } = useEthers();
  const { addTransaction } = useTransactions();
  const { t } = useI18n();
  const batchRelayerApproval = useRelayerApprovalQuery(batchRelayerAddress);

  /**
   * COMPUTED
   */

  const isUnlocked = computed(() =>
    approved.value || !isStETHTrade.value
      ? true
      : !!batchRelayerApproval.data.value
  );

  /**
   * METHODS
   */
  async function approve(): Promise<void> {
    approving.value = true;
    try {
      const tx = await sendTransaction(
        getProvider(),
        configService.network.addresses.vault,
        vaultAbi,
        'setRelayerApproval',
        [account.value, batchRelayerAddress.value, true]
      );

      addTransaction({
        id: tx.hash,
        type: 'tx',
        action: 'approve',
        summary: t('transactionSummary.approveBatchRelayer'),
        details: {
          contractAddress: configService.network.addresses.vault,
          spender: batchRelayerAddress.value
        }
      });
      txListener(tx, {
        onTxConfirmed: () => {
          approving.value = false;
          approved.value = true;
        },
        onTxFailed: () => {
          approving.value = false;
        }
      });
    } catch (e) {
      console.log(e);
      approving.value = false;
    }
  }

  return {
    approving,
    approve,
    approved,
    isUnlocked
  };
}