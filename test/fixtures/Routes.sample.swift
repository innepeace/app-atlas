import Foundation
import HSRouter

public extension Route {

    /// 下单页（买入/卖出）
    static let tradeOrderPost = Route("/trade/order/post")

    /// 股票详情页
    static let stockDetail = Route("/stock/detail")

    static let noDocRoute = Route("/misc/nodoc")
}
