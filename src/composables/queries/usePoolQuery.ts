import { computed, reactive } from 'vue';
import { useQuery } from 'vue-query';
import { QueryObserverOptions } from 'react-query/core';
import useTokens from '@/composables/useTokens';
import QUERY_KEYS from '@/constants/queryKeys';
import { balancerContractsService } from '@/services/balancer/contracts/balancer-contracts.service';
import { balancerSubgraphService } from '@/services/balancer/subgraph/balancer-subgraph.service';
import { FullPool } from '@/services/balancer/subgraph/types';
import { POOLS } from '@/constants/pools';
import useApp from '../useApp';
import useUserSettings from '../useUserSettings';
import useWeb3 from '@/services/web3/useWeb3';
import { forChange } from '@/lib/utils';
import { isManaged, isStableLike } from '../usePool';
import { getAddress, isAddress } from '@ethersproject/address';

export default function usePoolQuery(
  id: string,
  options: QueryObserverOptions<FullPool> = {}
) {
  /**
   * COMPOSABLES
   */
  const { getTokens, injectTokens, prices, dynamicDataLoading } = useTokens();
  const { appLoading } = useApp();
  const { account } = useWeb3();
  const { currency } = useUserSettings();

  /**
   * COMPUTED
   */
  const enabled = computed(
    () => !appLoading.value && !dynamicDataLoading.value
  );

  /**
   * QUERY INPUTS
   */
  const queryKey = QUERY_KEYS.Pools.Current(id);

  const queryFn = async () => {
    const [pool] = await balancerSubgraphService.pools.get({
      where: {
        id: id.toLowerCase(),
        totalShares_gt: -1 // Avoid the filtering for low liquidity pools
      }
    });

    const requiresAllowlisting =
      isStableLike(pool.poolType) || isManaged(pool.poolType);
    const isOwnedByUser =
      isAddress(account.value) &&
      getAddress(pool.owner) === getAddress(account.value);
    const isAllowlisted =
      POOLS.Stable.AllowList.includes(id) ||
      POOLS.Investment.AllowList.includes(id);
    if (requiresAllowlisting && !isAllowlisted && !isOwnedByUser) {
      throw new Error('Pool not allowed');
    }

    await injectTokens([
      ...pool.tokensList,
      balancerSubgraphService.pools.addressFor(pool.id)
    ]);
    await forChange(dynamicDataLoading, false);

    // Need to fetch onchain pool data first so that calculations can be
    // performed in the decoration step.
    const onchainData = await balancerContractsService.vault.getPoolData(
      id,
      pool.poolType,
      getTokens(pool.tokensList.map(address => getAddress(address)))
    );

    const [decoratedPool] = await balancerSubgraphService.pools.decorate(
      [{ ...pool, onchain: onchainData }],
      '24h',
      prices.value,
      currency.value
    );

    return { onchain: onchainData, ...decoratedPool };
  };

  const queryOptions = reactive({
    enabled,
    ...options
  });

  return useQuery<FullPool>(queryKey, queryFn, queryOptions);
}
